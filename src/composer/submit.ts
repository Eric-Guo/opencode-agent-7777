import { SessionMessage } from "@opencode/schema/session-message"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { prompt } from "@/composer/persistence-singleton"
import { buildPromptRequest } from "@/composer/request"
import { createComposerSubmission } from "@/composer/submission-state"
import { idleStatus, setState, state } from "@/runtime/server/session-store-compact"
import { captureSessionOwnership } from "@/session/session-ownership"
import { readableError } from "@/shell/errors/readable"
import type { ComposerDelivery } from "./adapter"
import { composerHistory } from "./history/store"
import { clonePrompt } from "./prompt-parts"
import { createPromptModelSelection } from "./selection"

// Compact single-session submit orchestration for the shared composer boundary.

export function submitPrompt(options?: { delivery?: ComposerDelivery; command?: string }) {
  const active = captureSessionOwnership()
  const submission = createComposerSubmission({ target: prompt })
  const attachments = submission.prompt.attachments
  const command = options?.command
  const request = buildPromptRequest({ ...submission.prompt, command })
  if (!active || state.submitting || (!command && !request.text && attachments.length === 0)) return
  const historyPrompt = clonePrompt(prompt.store[0].prompt)
  const previousRevert = state.session?.revert
  const delivery = options?.delivery ?? "steer"
  const selection = createPromptModelSelection()
  const selected = selection.current()
  const selectedModel = selected ? { providerID: selected.providerID, modelID: selected.modelID } : undefined
  const variant = selection.variant.current()
  const model = selectedModel ? { ...selectedModel, ...(variant ? { variant } : {}) } : undefined
  const optimisticBusy = state.sessionStatus.type === "idle"
  const revision = active.runtime.pendingRevision()

  const messageID = SessionMessage.ID.create()

  submission.clear()
  setState("error", "")
  setState("submitting", true)
  if (optimisticBusy) active.runtime.setStatus({ type: "busy" })
  if (state.session?.revert) {
    active.runtime.setSession({ ...active.runtime.view().session, revert: undefined })
  }
  if (delivery === "steer" && !command)
    active.runtime.echo({
      id: messageID,
      type: "user",
      text: request.text,
      files: attachments.map((attachment) => ({
        data: "",
        mime: attachment.mime,
        name: attachment.sourcePath ?? attachment.filename,
        source: { type: "uri" as const, uri: attachment.url },
      })),
      time: { created: Date.now() },
    })

  const cancelCommit =
    delivery === "steer" && model ? selection.trackSessionCommit({ model, variant: variant ?? null }) : undefined
  const configure = [
    ...(delivery === "steer"
      ? [active.client.session.switchAgent({ sessionID: active.sessionID, agent: active.localAgent })]
      : []),
    ...(delivery === "steer" && model
      ? [
          active.client.session.switchModel({
            sessionID: active.sessionID,
            model: { id: model.modelID, providerID: model.providerID, ...(variant ? { variant } : {}) },
          }),
        ]
      : []),
    ...(previousRevert ? [active.client.session.revert.clear({ sessionID: active.sessionID })] : []),
  ]

  return Promise.all(configure)
    .then(() => {
      if (command)
        return active.client.session
          .command({
            sessionID: active.sessionID,
            name: command,
            ...request,
            delivery,
          })
          .then(() => undefined)
      return active.client.session.prompt({
        sessionID: active.sessionID,
        id: messageID,
        ...request,
        delivery,
        metadata: {
          agent: active.localAgent,
          ...(model ? { model } : {}),
        },
      })
    })
    .then((admitted) => {
      composerHistory.add(historyPrompt, "normal")
      if (!active.current()) return
      // SSE may already have delivered or cancelled this admission before HTTP returns.
      if (admitted && active.runtime.pendingRevision() === revision) {
        active.runtime.updatePending((items) => [...items.filter((item) => item.id !== admitted.id), admitted])
      }
      active.runtime.schedule(250)
      return refreshRecentSessions()
    })
    .catch((error) => {
      cancelCommit?.()
      if (!active.current()) return
      active.runtime.dropEcho(messageID)
      const restored = submission.restore()
      if (restored) restored.target.restore(restored.prompt)
      if (previousRevert && !state.session?.revert) {
        active.runtime.setSession({ ...active.runtime.view().session, revert: previousRevert })
      }
      setState("error", readableError(error))
      if (optimisticBusy) active.runtime.setStatus(idleStatus)
      active.runtime.schedule(0)
    })
    .finally(() => {
      if (active.current()) setState("submitting", false)
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
