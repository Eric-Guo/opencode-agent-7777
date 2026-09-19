import { SessionMessage } from "@opencode/schema/session-message"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { createModelSelection } from "@/providers/models/selection"
import {
  dropPendingEcho,
  echoPendingUserMessage,
  pendingInboxRevision,
  updatePendingInbox,
} from "@/runtime/server/global-sync/session-cache-messages"
import { prompt } from "@/composer/persistence-singleton"
import { buildPromptRequest } from "@/composer/request"
import { createComposerSubmission } from "@/composer/submission-state"
import { scheduleRefresh } from "@/runtime/server/sync-session-compact"
import { currentSession, idleStatus, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import type { ComposerDelivery } from "./adapter"

// Compact single-session submit orchestration for the shared composer boundary.

export function submitPrompt(options?: { delivery?: ComposerDelivery }) {
  const active = currentSession()
  const submission = createComposerSubmission({ target: prompt })
  const attachments = submission.prompt.attachments
  const request = buildPromptRequest(submission.prompt)
  if (!active || state.submitting || (!request.text && attachments.length === 0)) return
  const previousRevert = state.session?.revert
  const delivery = options?.delivery ?? "steer"
  const selectedModel = state.selectedModel ? { ...state.selectedModel } : undefined
  const variant = createModelSelection().variant.current()
  const model = selectedModel ? { ...selectedModel, ...(variant ? { variant } : {}) } : undefined
  const optimisticBusy = state.sessionStatus.type === "idle"
  const revision = pendingInboxRevision()

  const messageID = SessionMessage.ID.create()

  submission.clear()
  setState("error", "")
  setState("submitting", true)
  if (optimisticBusy) setState("sessionStatus", { type: "busy" })
  if (state.session?.revert) {
    setState("session", (session) => (session ? { ...session, revert: undefined } : session))
  }
  if (delivery === "steer")
    echoPendingUserMessage({
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
    .then(() =>
      active.client.session.prompt({
        sessionID: active.sessionID,
        id: messageID,
        text: request.text,
        files: request.files,
        delivery,
        metadata: {
          agent: active.localAgent,
          ...(model ? { model } : {}),
        },
      }),
    )
    .then((admitted) => {
      if (state.session?.id !== active.sessionID) return
      // SSE may already have delivered or cancelled this admission before HTTP returns.
      if (admitted && pendingInboxRevision() === revision) {
        updatePendingInbox((items) => [...items.filter((item) => item.id !== admitted.id), admitted])
      }
      scheduleRefresh(250)
      return refreshRecentSessions()
    })
    .catch((error) => {
      if (state.session?.id !== active.sessionID) return
      dropPendingEcho(messageID)
      const restored = submission.restore()
      if (restored) restored.target.restore(restored.prompt)
      if (previousRevert && !state.session.revert) {
        setState("session", (session) => (session ? { ...session, revert: previousRevert } : session))
      }
      setState("error", readableError(error))
      if (optimisticBusy) setState("sessionStatus", idleStatus)
      scheduleRefresh(0)
    })
    .finally(() => {
      if (state.session?.id === active.sessionID) setState("submitting", false)
    })
}

export function abortPrompt() {
  const active = currentSession()
  if (!active) return
  void active.client.session
    .interrupt({ sessionID: active.sessionID, resume: true })
    .catch((error) => {
      if (state.session?.id === active.sessionID) setState("error", readableError(error))
    })
    .finally(() => {
      if (state.session?.id === active.sessionID) scheduleRefresh()
    })
}
