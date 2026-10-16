// Imperative directory request sync and replies for the compact session tree.
import type { OpenCodeEvent, PermissionRequest } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { currentSession, currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { sessionPermissionRequest } from "@/session/requests/session-request-tree"
import { createPermissionNotifications } from "@/shell/notifications/notification"
import { groupSessionRequests, respondToRequest } from "./sync-compact"

const notifications = createPermissionNotifications()

function currentPermission(requests: Record<string, PermissionRequest[] | undefined>) {
  const sessions = state.session ? [state.session, ...state.recentSessions] : state.recentSessions
  return sessionPermissionRequest(sessions, requests, state.session?.id)
}

export function refreshPermissions() {
  const active = currentSession()
  const session = state.session
  if (!active || !session) return Promise.resolve()

  const runtime = currentRuntime()
  const current = () => currentRuntime() === runtime && state.session?.id === active.sessionID
  return active.client.permission.request
    .list({ location: { directory: sessionDirectory(session) } })
    .then((result) => {
      if (!current()) return
      const requests = groupSessionRequests(result.data)
      setState("permission", reconcile(requests))
      notifications.clear()
      const request = currentPermission(requests)
      if (request) notifications.notify(request)
    })
    .finally(() => {
      if (current()) setState("permissionResponding", undefined)
    })
}

export function handlePermissionEvent(event: OpenCodeEvent) {
  if (event.type === "permission.asked") {
    const request = event.data
    setState("permission", request.sessionID, (current = []) => [
      request,
      ...current.filter((item) => item.id !== request.id),
    ])
    if (currentPermission(state.permission)?.id === request.id) notifications.notify(request)
    return true
  }

  if (event.type === "permission.replied") {
    const replied = event.data
    notifications.forget(replied.requestID)
    setState("permission", replied.sessionID, (current = []) => current.filter((item) => item.id !== replied.requestID))
    setState("permissionResponding", (current) => (current === replied.requestID ? undefined : current))
    return true
  }

  return false
}

export function decidePermission(request: PermissionRequest, response: "once" | "always" | "reject") {
  respondToRequest("permission", request, (client) =>
    client.permission.reply({ sessionID: request.sessionID, requestID: request.id, decision: response }),
  )
}
