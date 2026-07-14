import type { OpenCodeEvent as OpencodeEvent, SessionStatus } from "@opencode-ai/client"
import { idleStatus, setState, state } from "@/context/server-session"
import { readableError } from "@/utils/server-errors"

export function applySessionEvent(event: OpencodeEvent, input: { refresh: () => void }) {
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
  if (event.type === "session.error" && (!data.sessionID || data.sessionID === state.session?.id)) {
    setState("error", readableError(data.error))
    return true
  }
  if (data.sessionID !== state.session?.id) return false
  if (event.type === "session.renamed" && data.title) setState("session", "title", data.title)
  if (event.type === "session.revert.staged" && data.revert) {
    setState("session", "revert", data.revert as NonNullable<typeof state.session>["revert"])
  }
  if (event.type === "session.revert.cleared" || event.type === "session.revert.committed") {
    setState("session", "revert", undefined)
  }
  if (event.type.startsWith("session.") || event.type.startsWith("message.")) {
    input.refresh()
    return true
  }
  return false
}
