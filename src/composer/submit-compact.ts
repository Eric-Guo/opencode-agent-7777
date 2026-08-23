import { SessionMessage } from "@opencode-ai/schema/session-message"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { dropPendingEcho, echoPendingUserMessage } from "@/runtime/server/global-sync/session-cache-messages"
import { prompt } from "@/composer/persistence-singleton"
import { scheduleRefresh } from "@/runtime/server/sync-session-compact"
import { currentSession, idleStatus, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"

export function submitPrompt() {
  const active = currentSession()
  const text = prompt.current().trim()
  const attachments = [...prompt.attachments()]
  if (!active || state.submitting || (!text && attachments.length === 0)) return
  const previousRevert = state.session?.revert

  const messageID = SessionMessage.ID.create()
  const requestFiles = attachments.map((attachment) => ({
    uri: attachment.url,
    name: attachment.sourcePath ?? attachment.filename,
  }))

  prompt.reset()
  setState("error", "")
  setState("submitting", true)
  setState("sessionStatus", { type: "busy" })
  if (state.session?.revert) {
    setState("session", (session) => (session ? { ...session, revert: undefined } : session))
  }
  echoPendingUserMessage({
    id: messageID,
    type: "user",
    text,
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

  void Promise.all(configure)
    .then(() =>
      active.client.session.prompt({
        sessionID: active.sessionID,
        id: messageID,
        text,
        files: requestFiles,
      }),
    )
    .then(() => {
      scheduleRefresh(250)
      return refreshRecentSessions()
    })
    .catch((error) => {
      dropPendingEcho(messageID)
      if (previousRevert && state.session?.id === active.sessionID && !state.session.revert) {
        setState("session", (session) => (session ? { ...session, revert: previousRevert } : session))
      }
      setState("error", readableError(error))
      setState("sessionStatus", idleStatus)
      scheduleRefresh(0)
    })
    .finally(() => setState("submitting", false))
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
