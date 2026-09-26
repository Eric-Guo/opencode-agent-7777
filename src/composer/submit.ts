import { abort } from "@opencode/util/abort"
import { bounded } from "@/runtime/server/operation"
import { createComposerSubmitState, transitionComposerSubmit, composerSubmitting } from "./machine"
import { SessionMessage } from "@opencode/schema/session-message"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { prompt } from "@/composer/persistence-singleton"
import { buildPromptRequest } from "@/composer/request"
import { createComposerSubmission } from "@/composer/submission-state"
import { currentDraft, idleStatus, setState, state } from "@/runtime/server/session-store-compact"
import { createSession } from "@/runtime/server/global-sync/session-load-current"
import { activateSession, restartSessionEventStream } from "@/runtime/server/sync-session-compact"
import { localModelSelection } from "@/providers/models/selection"
import { captureSessionOwnership } from "@/session/session-ownership"
import { readableError } from "@/shell/errors/readable"
import type { ComposerDelivery } from "./adapter"
import { composerHistory } from "./history/store"
import { clonePrompt } from "./prompt-parts"
import { createPromptModelSelection } from "./selection"

// A submission keeps its captured target across navigation. The weak entry gates
// duplicate sends for that activation; the driver owns only I/O resources.
const submissions = new WeakMap<object, ReturnType<typeof createComposerSubmitState<object>>>()

export function submitPrompt(options?: { delivery?: ComposerDelivery; command?: string }) {
  let active = state.session ? captureSessionOwnership() : undefined
  const draft = currentDraft()
  const server = state.server
  const submission = createComposerSubmission({ target: prompt })
  const attachments = submission.prompt.attachments
  const command = options?.command
  const request = buildPromptRequest({ ...submission.prompt, command })
  const owner = active?.runtime ?? draft
  if (
    (!active && (!draft || !server)) ||
    !owner ||
    submissions.get(owner)?.status === "running" ||
    (!command && !request.text && attachments.length === 0)
  )
    return
  const historyPrompt = clonePrompt(prompt.store[0].prompt)
  const previousRevert = state.session?.revert
  const delivery = options?.delivery ?? "steer"
  const selection = createPromptModelSelection()
  const selected = selection.current()
  const selectedModel = selected ? { providerID: selected.providerID, modelID: selected.modelID } : undefined
  const variant = selection.variant.current()
  const model = selectedModel ? { ...selectedModel, ...(variant ? { variant } : {}) } : undefined
  const optimisticBusy = state.sessionStatus.type === "idle"

  const messageID = SessionMessage.ID.create()

  let machine = transitionComposerSubmit(submissions.get(owner) ?? createComposerSubmitState<object>(), {
    type: "submit",
    creating: !active,
    snapshot: { prompt: submission.prompt, request, model, variant, delivery, command, messageID, owner },
  })
  const attempt = machine.attempt
  const dispatch = (type: "accepted" | "failed" | "disposed") => {
    machine = transitionComposerSubmit(machine, { type, attempt })
    submissions.set(owner, machine)
    if (active) submissions.set(active.runtime, machine)
    if (current()) setState("submitting", composerSubmitting(machine))
  }
  submissions.set(owner, machine)
  submission.clear()
  setState("error", "")
  setState("submitting", composerSubmitting(machine))
  const current = () => (active ? active.current() : currentDraft() === draft)
  let optimisticRevision: number | undefined
  let cancelCommit: (() => void) | undefined
  const send = (target: NonNullable<typeof active>) => {
    const revision = target.runtime.pendingRevision()
    if (optimisticBusy) {
      target.runtime.setStatus({ type: "busy" })
      optimisticRevision = target.runtime.statusRevision()
    }
    if (state.session?.revert) {
      target.runtime.setSession({ ...target.runtime.view().session, revert: undefined })
    }
    if (delivery === "steer" && !command)
      target.runtime.echo({
        id: messageID,
        type: "user",
        text: request.text,
        files: request.files.map((file) => ({
          data: "",
          mime: attachments.find((attachment) => attachment.url === file.uri)?.mime ?? "text/plain",
          name: file.name,
          source: { type: "uri" as const, uri: file.uri },
          ...("mention" in file ? { mention: file.mention } : {}),
        })),
        time: { created: Date.now() },
      })

    cancelCommit =
      delivery === "steer" && model ? selection.trackSessionCommit({ model, variant: variant ?? null }) : undefined
    machine = transitionComposerSubmit(machine, { type: "advance", attempt, phase: "configuring" })
    const configure = bounded((signal) =>
      Promise.all([
        ...(delivery === "steer"
          ? [target.client.session.switchAgent({ sessionID: target.sessionID, agent: target.localAgent }, { signal })]
          : []),
        ...(delivery === "steer" && model
          ? [
              target.client.session.switchModel(
                {
                  sessionID: target.sessionID,
                  model: { id: model.modelID, providerID: model.providerID, ...(variant ? { variant } : {}) },
                },
                { signal },
              ),
            ]
          : []),
        ...(previousRevert ? [target.client.session.revert.clear({ sessionID: target.sessionID }, { signal })] : []),
      ]),
    )

    return configure
      .then(() => {
        machine = transitionComposerSubmit(machine, { type: "advance", attempt, phase: "sending" })
        return bounded(async (signal) => {
          if (command)
            return target.client.session
              .command(
                {
                  sessionID: target.sessionID,
                  name: command,
                  ...request,
                  delivery,
                },
                { signal },
              )
              .then(() => undefined)
          const confirmed = Promise.withResolvers<void>()
          const http = new AbortController()
          const requestSignal = AbortSignal.any([signal, http.signal])
          const stop = target.runtime.events.listen(({ details: event }) => {
            if (
              event.type === "session.inbox.enqueued" &&
              event.data.sessionID === target.sessionID &&
              event.data.inboxID === messageID
            )
              confirmed.resolve()
          })
          signal.addEventListener("abort", stop, { once: true })
          try {
            return await Promise.race([
              target.client.session.prompt(
                {
                  sessionID: target.sessionID,
                  id: messageID,
                  ...request,
                  delivery,
                  metadata: {
                    agent: target.localAgent,
                    ...(model ? { model } : {}),
                  },
                },
                { signal: requestSignal },
              ),
              confirmed.promise.then(() => {
                abort(http)
              }),
            ])
          } finally {
            stop()
            signal.removeEventListener("abort", stop)
          }
        })
      })
      .then((admitted) => {
        dispatch("accepted")
        composerHistory.add(historyPrompt, "normal")
        if (!target.current()) return
        // SSE may already have delivered or cancelled this admission before HTTP returns.
        if (admitted && target.runtime.pendingRevision() === revision) {
          target.runtime.updatePending((items) => [...items.filter((item) => item.id !== admitted.id), admitted])
        }
        target.runtime.schedule(250)
        void refreshRecentSessions().catch(() => {})
      })
  }

  const sending = active
    ? send(active)
    : bounded((signal) => createSession(draft!.api, draft!.directory, server!.localAgent, signal), {
        signal: draft!.signal,
      }).then((session) => {
        if (!current()) return
        // Promote the draft without clearing text typed while creation was pending or hydrating an empty session.
        const choice = localModelSelection.draft.current()
        void activateSession(server!, session, { created: true })
        localModelSelection.draft.set(choice)
        active = captureSessionOwnership()
        if (active) submissions.set(active.runtime, machine)
        restartSessionEventStream()
        return active ? send(active) : undefined
      })

  return sending
    .catch((error) => {
      dispatch("failed")
      cancelCommit?.()
      if (!current()) return
      active?.runtime.dropEcho(messageID)
      const restored = submission.restore()
      if (restored) restored.target.restore(restored.prompt)
      if (previousRevert && !state.session?.revert) {
        active?.runtime.setSession({ ...active.runtime.view().session, revert: previousRevert })
      }
      setState("error", readableError(error))
      if (optimisticBusy && active?.runtime.statusRevision() === optimisticRevision)
        active?.runtime.setStatus(idleStatus)
      active?.runtime.schedule(0)
    })
    .finally(() => {
      if (machine.status === "running") dispatch("disposed")
      if (current()) setState("submitting", composerSubmitting(machine))
    })
}

export function abortPrompt() {
  const active = captureSessionOwnership()
  if (!active) return
  void bounded((signal) => active.client.session.interrupt({ sessionID: active.sessionID, resume: true }, { signal }))
    .catch((error) => {
      if (active.current()) setState("error", readableError(error))
    })
    .finally(() => {
      if (active.current()) active.runtime.schedule()
    })
}
