import { refreshRecentSessions } from "@/context/directory-sync-recent-sessions"
import { dropPendingEcho, echoPendingUserMessage } from "@/context/global-sync/session-cache-messages"
import { prompt } from "@/context/prompt"
import { scheduleRefresh } from "@/context/server-sync-session"
import { currentSession, idleStatus, setState, state } from "@/context/server-session-store"
import { Identifier } from "@/utils/id"
import { readableError } from "@/utils/readable-error"

export function submitPrompt() {
  const active = currentSession()
  const text = prompt.current().trim()
  const attachments = [...prompt.attachments()]
  if (!active || state.submitting || (!text && attachments.length === 0)) return
  const previousRevert = state.session?.revert

  const messageID = Identifier.ascending("message")
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
      if (state.session?.id === active.sessionID) setState("sessionStatus", idleStatus)
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
    .interrupt({ sessionID: active.sessionID })
    .catch((error) => setState("error", readableError(error)))
    .finally(() => {
      setState("submitting", false)
      scheduleRefresh()
    })
}
