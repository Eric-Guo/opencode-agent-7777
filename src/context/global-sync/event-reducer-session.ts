// Reduces events for the one active session; streams V2 content deltas through the shared main-app reducer
// and delegates message hydration to the refresh queue.
import type { OpenCodeEvent, SessionStatus } from "@opencode-ai/client/promise"
import { projectSessionMessages } from "@/context/global-sync/session-cache-projection"
import { createV2SessionReducer } from "@/context/server-session-v2-reducer"
import { currentSession, idleStatus, setState, state } from "@/context/server-session-store"
import { readableError } from "@/utils/readable-error"

const reducer = createV2SessionReducer()

function applyReduction(event: OpenCodeEvent) {
  const active = currentSession()
  if (!active) return false
  const reduction = reducer.reduce(state.sessionMessages, event, state.session)
  if (!reduction) return false
  setState("sessionMessages", reduction.messages)
  setState(
    "messages",
    projectSessionMessages({
      sessionID: active.sessionID,
      session: state.session,
      localAgent: active.localAgent,
      messages: reduction.messages,
    }),
  )
  return true
}

export function applySessionEvent(event: OpenCodeEvent, input: { refresh: () => void }) {
  const data = event.data as {
    sessionID?: string
    status?: SessionStatus
    error?: unknown
    title?: string
    revert?: unknown
  }
  if (event.type === "session.status" && data.sessionID === state.session?.id && data.status) {
    setState("sessionStatus", data.status)
    return true
  }
  if (event.type === "session.idle" && data.sessionID === state.session?.id) {
    setState("sessionStatus", idleStatus)
    input.refresh()
    return true
  }
  if (event.type === "session.execution.failed" && (!data.sessionID || data.sessionID === state.session?.id)) {
    setState("error", readableError(data.error))
  }
  if (data.sessionID !== state.session?.id) return false
  if (event.type === "session.renamed" && data.title) setState("session", "title", data.title)
  if (event.type === "session.revert.staged" && data.revert) {
    setState("session", "revert", data.revert as NonNullable<typeof state.session>["revert"])
  }
  if (event.type === "session.revert.cleared" || event.type === "session.revert.committed") {
    setState("session", "revert", undefined)
  }
  if (applyReduction(event)) return true
  if (event.type.startsWith("session.") || event.type.startsWith("message.")) {
    input.refresh()
    return true
  }
  return false
}
