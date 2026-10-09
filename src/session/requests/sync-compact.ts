import type { OpenCodeClient } from "@opencode/client/promise"
import { currentSession, currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { scheduleRefresh } from "@/runtime/server/sync-session-compact"
import { readableError } from "@/shell/errors/readable"

export function groupSessionRequests<T extends { sessionID: string }>(requests: T[]) {
  return requests.reduce<Record<string, T[]>>((result, request) => {
    ;(result[request.sessionID] ??= []).push(request)
    return result
  }, {})
}

// Permission and question replies share the same activation and pending-request lifecycle.
// Directory discovery, event filtering and permission notifications stay with their adapters.
export function respondToRequest(
  kind: "permission" | "form",
  request: { id: string; sessionID: string },
  send: (client: OpenCodeClient) => Promise<void>,
) {
  const active = currentSession()
  const responding = kind === "permission" ? "permissionResponding" : "questionResponding"
  if (!active || state[responding]) return
  const runtime = currentRuntime()
  const current = () => currentRuntime() === runtime && state.session?.id === active.sessionID
  setState("error", "")
  setState(responding, request.id)
  void send(active.client)
    .then(() => {
      if (!current()) return
      if (kind === "permission")
        setState("permission", request.sessionID, (items = []) => items.filter((item) => item.id !== request.id))
      else setState("form", request.sessionID, (items = []) => items.filter((item) => item.id !== request.id))
      scheduleRefresh(120)
    })
    .catch((error) => {
      if (current()) setState("error", readableError(error))
    })
    .finally(() => {
      if (current()) setState(responding, (id) => (id === request.id ? undefined : id))
    })
}
