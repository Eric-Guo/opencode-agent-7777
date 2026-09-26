import { abort } from "@opencode/util/abort"
import { bounded } from "@/runtime/server/operation"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { prompt } from "@/composer/persistence-singleton"
import { buildPromptRequest } from "@/composer/request"
import { createComposerSubmission } from "@/composer/submission-state"
import { currentDraft, idleStatus, setState, state } from "@/runtime/server/session-store-compact"
import { createSession } from "@/runtime/server/global-sync/session-load-current"
import { activateSession, restartSessionEventStream } from "@/runtime/server/sync-session-compact"
import { sameChoice } from "@/providers/models/selection-machine"
import { localModelSelection } from "@/providers/models/selection"
import { captureSessionOwnership } from "@/session/session-ownership"
import { readableError } from "@/shell/errors/readable"
import type { ComposerDelivery } from "./adapter"
import { composerHistory } from "./history/store"
import { createComposerSubmitState, transitionComposerSubmit, composerSubmitting } from "./machine"
import { createPromptAdmission } from "./retry"
import { clonePrompt } from "./prompt-parts"
import { createPromptModelSelection } from "./selection"

// A submission keeps its captured target across navigation. The weak entry gates
// duplicate sends for that activation; the driver owns only I/O resources.
const submissions = new WeakMap<object, ReturnType<typeof createComposerSubmitState<object>>>()

type SubmissionTarget = NonNullable<ReturnType<typeof captureSessionOwnership>>

async function postPrompt(
  target: SubmissionTarget,
  input: ReturnType<typeof createPromptAdmission>["input"],
  signal: AbortSignal,
) {
  const confirmed = Promise.withResolvers<void>()
  const http = new AbortController()
  const requestSignal = AbortSignal.any([signal, http.signal])
  const stop = target.runtime.events.listen(({ details: event }) => {
    if (
      event.type.startsWith("session.inbox.") &&
      "inboxID" in event.data &&
      event.data.sessionID === target.sessionID &&
      event.data.inboxID === input.id
    )
      confirmed.resolve()
  })
  signal.addEventListener("abort", stop, { once: true })
  try {
    return await Promise.race([
      target.client.session.prompt(input, { signal: requestSignal }),
      confirmed.promise.then(() => abort(http)),
    ])
  } finally {
    stop()
    signal.removeEventListener("abort", stop)
  }
}

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

  const saved = prompt.store[0].retry
  const pendingChoice = saved?.model && !selected ? localModelSelection.draft.current() : undefined
  const catalogUnavailable =
    state.modelStatus !== "ready" &&
    !selected &&
    !!saved?.model &&
    (!pendingChoice || sameChoice(pendingChoice, { model: saved.model, variant: saved.model.variant ?? null }))
  let admission: ReturnType<typeof createPromptAdmission> | undefined

  let machine = transitionComposerSubmit(submissions.get(owner) ?? createComposerSubmitState<object>(), {
    type: "submit",
    creating: !active,
    snapshot: { prompt: submission.prompt, request, model, variant, delivery, command, owner },
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
  const send = async (target: SubmissionTarget) => {
    const { runtime, sessionID } = target
    const attemptPrompt = command
      ? undefined
      : createPromptAdmission(
          server?.url,
          {
            sessionID,
            ...request,
            delivery,
            metadata: { agent: target.localAgent, ...(model ? { model } : {}) },
          },
          saved,
          catalogUnavailable,
        )
    admission = attemptPrompt
    const outgoingModel = attemptPrompt?.input.metadata.model ?? model
    const observed = () => attemptPrompt && runtime.admitted(attemptPrompt.input.id)
    const accepted = () => {
      dispatch("accepted")
      composerHistory.add(historyPrompt, "normal")
      if (!target.current()) return
      runtime.schedule(250)
      void refreshRecentSessions().catch(() => {})
    }
    if (attemptPrompt?.replay && observed()) return accepted()

    const revision = runtime.pendingRevision()
    if (optimisticBusy && !attemptPrompt?.replay) {
      runtime.setStatus({ type: "busy" })
      optimisticRevision = runtime.statusRevision()
    }
    if (state.session?.revert) {
      runtime.setSession({ ...runtime.view().session, revert: undefined })
    }
    if (delivery === "steer" && attemptPrompt && !attemptPrompt.replay)
      runtime.echo({
        id: attemptPrompt.input.id,
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
      delivery === "steer" && outgoingModel
        ? selection.trackSessionCommit({ model: outgoingModel, variant: outgoingModel.variant ?? null })
        : undefined
    machine = transitionComposerSubmit(machine, { type: "advance", attempt, phase: "configuring" })
    let admitted
    try {
      await bounded((signal) =>
        Promise.all([
          ...(delivery === "steer"
            ? [target.client.session.switchAgent({ sessionID, agent: target.localAgent }, { signal })]
            : []),
          ...(delivery === "steer" && outgoingModel
            ? [
                target.client.session.switchModel(
                  {
                    sessionID,
                    model: {
                      id: outgoingModel.modelID,
                      providerID: outgoingModel.providerID,
                      ...(outgoingModel.variant ? { variant: outgoingModel.variant } : {}),
                    },
                  },
                  { signal },
                ),
              ]
            : []),
          ...(previousRevert ? [target.client.session.revert.clear({ sessionID }, { signal })] : []),
        ]),
      )
      machine = transitionComposerSubmit(machine, { type: "advance", attempt, phase: "sending" })
      if (command) {
        await bounded((signal) =>
          target.client.session.command({ sessionID, name: command, ...request, delivery }, { signal }),
        )
      } else if (attemptPrompt && !observed()) {
        admitted = await bounded((signal) => postPrompt(target, attemptPrompt.input, signal))
      }
    } catch (error) {
      // A snapshot or a delivery event can confirm admission even when HTTP fails.
      if (!observed()) throw error
    }
    // A replay receipt may describe a delivered message outside loaded history.
    // The scheduled inbox read establishes whether a replay is still pending.
    if (admitted && !attemptPrompt?.replay && target.current() && runtime.pendingRevision() === revision) {
      runtime.updatePending((items) => [...items.filter((item) => item.id !== admitted.id), admitted])
    }
    accepted()
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
      const mayHaveBeenSent = machine.status === "running" && machine.phase === "sending"
      dispatch("failed")
      cancelCommit?.()
      if (!current()) return
      if (admission) active?.runtime.dropEcho(admission.input.id)
      const restored = submission.restore()
      if (restored) {
        const retry = mayHaveBeenSent || admission?.replay ? admission?.retry(error) : undefined
        restored.target.restore({ ...restored.prompt, retry })
      }
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
