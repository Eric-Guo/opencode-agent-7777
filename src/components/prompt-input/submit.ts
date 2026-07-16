import { refreshRecentSessions } from "@/context/directory-sync-recent-sessions"
import { clearPromptDraft } from "@/context/prompt-state-storage"
import { scheduleRefresh } from "@/context/server-sync-session"
import { currentSession, idleStatus, setState, state } from "@/context/server-session-store"
import { readableError } from "@/utils/server-errors"
import { buildRequestParts, createOptimisticUserMessage } from "./build-request-parts"

function appendOptimisticMessage(input: {
  messageID: string
  sessionID: string
  parts: ReturnType<typeof buildRequestParts>["optimisticParts"]
}) {
  const active = currentSession()
  if (!active) return

  setState("messages", (items) => [
    ...items,
    createOptimisticUserMessage({
      messageID: input.messageID,
      sessionID: input.sessionID,
      localAgent: active.localAgent,
      model: state.selectedModel,
      parts: input.parts,
    }),
  ])
}

export function submitPrompt() {
  const active = currentSession()
  const text = state.prompt.trim()
  const attachments = [...state.attachments]
  if (!active || state.submitting || (!text && attachments.length === 0)) return
  const previousRevert = state.session?.revert

  const parts = buildRequestParts({
    text,
    attachments,
    sessionID: active.sessionID,
  })

  setState("prompt", "")
  setState("attachments", [])
  clearPromptDraft()
  setState("error", "")
  setState("submitting", true)
  setState("sessionStatus", { type: "busy" })
  if (state.session?.revert) {
    setState("session", (session) => (session ? { ...session, revert: undefined } : session))
  }
  appendOptimisticMessage({
    messageID: parts.localMessageID,
    sessionID: active.sessionID,
    parts: parts.optimisticParts,
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
        text,
        files: parts.requestFiles,
      }),
    )
    .then(() => {
      if (state.session?.id === active.sessionID) setState("sessionStatus", idleStatus)
      scheduleRefresh(250)
      return refreshRecentSessions()
    })
    .catch((error) => {
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
