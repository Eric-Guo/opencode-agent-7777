import { SessionMessage } from "@opencode-ai/schema/session-message"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { dropPendingEcho, echoPendingUserMessage } from "@/runtime/server/global-sync/session-cache-messages"
import { prompt } from "@/composer/persistence-singleton"
import { buildPromptRequest } from "@/composer/request"
import { createComposerSubmission } from "@/composer/submission-state"
import { scheduleRefresh } from "@/runtime/server/sync-session-compact"
import { currentSession, idleStatus, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"

// Compact single-session submit orchestration for the shared composer boundary.

export function submitPrompt() {
  const active = currentSession()
  const submission = createComposerSubmission({ target: prompt })
  const attachments = submission.prompt.attachments
  const request = buildPromptRequest(submission.prompt)
  if (!active || state.submitting || (!request.text && attachments.length === 0)) return
  const previousRevert = state.session?.revert

  const messageID = SessionMessage.ID.create()

  submission.clear()
  setState("error", "")
  setState("submitting", true)
  setState("sessionStatus", { type: "busy" })
  if (state.session?.revert) {
    setState("session", (session) => (session ? { ...session, revert: undefined } : session))
  }
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
    active.client.session.switchAgent({ sessionID: active.sessionID, agent: active.localAgent }),
    ...(state.selectedModel
      ? [
          active.client.session.switchModel({
            sessionID: active.sessionID,
            model: { id: state.selectedModel.modelID, providerID: state.selectedModel.providerID },
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
      }),
    )
    .then(() => {
      if (state.session?.id !== active.sessionID) return
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
      setState("sessionStatus", idleStatus)
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
    .interrupt({ sessionID: active.sessionID, continue: true })
    .catch((error) => setState("error", readableError(error)))
    .finally(() => {
      setState("submitting", false)
      scheduleRefresh()
    })
}
