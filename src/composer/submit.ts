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

// Compact single-session submit orchestration for the shared composer boundary.

export function submitPrompt(options?: { delivery?: ComposerDelivery; command?: string }) {
  let active = state.session ? captureSessionOwnership() : undefined
  const draft = currentDraft()
  const server = state.server
  const submission = createComposerSubmission({ target: prompt })
  const attachments = submission.prompt.attachments
  const command = options?.command
  const request = buildPromptRequest({ ...submission.prompt, command })
  if ((!active && (!draft || !server)) || state.submitting || (!command && !request.text && attachments.length === 0))
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

  submission.clear()
  setState("error", "")
  setState("submitting", true)
  const current = () => (active ? active.current() : currentDraft() === draft)
  let cancelCommit: (() => void) | undefined
  const send = (target: NonNullable<typeof active>) => {
    const revision = target.runtime.pendingRevision()
    if (optimisticBusy) target.runtime.setStatus({ type: "busy" })
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
    const configure = [
      ...(delivery === "steer"
        ? [target.client.session.switchAgent({ sessionID: target.sessionID, agent: target.localAgent })]
        : []),
      ...(delivery === "steer" && model
        ? [
            target.client.session.switchModel({
              sessionID: target.sessionID,
              model: { id: model.modelID, providerID: model.providerID, ...(variant ? { variant } : {}) },
            }),
          ]
        : []),
      ...(previousRevert ? [target.client.session.revert.clear({ sessionID: target.sessionID })] : []),
    ]

    return Promise.all(configure)
      .then(() => {
        if (command)
          return target.client.session
            .command({
              sessionID: target.sessionID,
              name: command,
              ...request,
              delivery,
            })
            .then(() => undefined)
        return target.client.session.prompt({
          sessionID: target.sessionID,
          id: messageID,
          ...request,
          delivery,
          metadata: {
            agent: target.localAgent,
            ...(model ? { model } : {}),
          },
        })
      })
      .then((admitted) => {
        composerHistory.add(historyPrompt, "normal")
        if (!target.current()) return
        // SSE may already have delivered or cancelled this admission before HTTP returns.
        if (admitted && target.runtime.pendingRevision() === revision) {
          target.runtime.updatePending((items) => [...items.filter((item) => item.id !== admitted.id), admitted])
        }
        target.runtime.schedule(250)
        return refreshRecentSessions()
      })
  }

  const sending = active
    ? send(active)
    : createSession(draft!.api, draft!.directory, server!.localAgent).then((session) => {
        if (!current()) return
        // Promote the draft without clearing text typed while creation was pending or hydrating an empty session.
        const choice = localModelSelection.draft.current()
        void activateSession(server!, session, { created: true })
        localModelSelection.draft.set(choice)
        active = captureSessionOwnership()
        restartSessionEventStream()
        return active ? send(active) : undefined
      })

  return sending
    .catch((error) => {
      cancelCommit?.()
      if (!current()) return
      active?.runtime.dropEcho(messageID)
      const restored = submission.restore()
      if (restored) restored.target.restore(restored.prompt)
      if (previousRevert && !state.session?.revert) {
        active?.runtime.setSession({ ...active.runtime.view().session, revert: previousRevert })
      }
      setState("error", readableError(error))
      if (optimisticBusy) active?.runtime.setStatus(idleStatus)
      active?.runtime.schedule(0)
    })
    .finally(() => {
      if (current()) setState("submitting", false)
    })
}

export function abortPrompt() {
  const active = captureSessionOwnership()
  if (!active) return
  void active.client.session
    .interrupt({ sessionID: active.sessionID, resume: true })
    .catch((error) => {
      if (active.current()) setState("error", readableError(error))
    })
    .finally(() => {
      if (active.current()) active.runtime.schedule()
    })
}
