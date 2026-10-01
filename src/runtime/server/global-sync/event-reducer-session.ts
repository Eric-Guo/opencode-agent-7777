// Compact side effects; the shared client owns protocol message projection.
import type { OpenCodeEvent, SessionStatus } from "@opencode/client/promise"
import { currentRuntime, setSessionStatus, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { reconcileModelSelection } from "@/providers/models/selection"

export function applySessionEvent(event: OpenCodeEvent, input: { refresh: () => void }) {
  const runtime = currentRuntime()
  if (!runtime || !runtime.alive()) return false
  if ("sessionID" in event.data && event.data.sessionID !== state.session?.id) return false
  // Older servers can send these presentation statuses alongside execution events.
  const legacy = event as { type: string; data: { status?: SessionStatus } }
  if (legacy.type === "session.status" && legacy.data.status) {
    setSessionStatus(legacy.data.status)
    return true
  }
  if (legacy.type === "session.idle") {
    setSessionStatus({ type: "idle" })
    input.refresh()
    return true
  }
  const handled = runtime.apply(event)
  if (event.type === "session.execution.failed") setState("error", readableError(event.data.error))
  if (event.type === "session.model.selected" || event.type === "session.agent.selected") reconcileModelSelection()
  return handled
}
