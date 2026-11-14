// Imperative directory request sync and replies for the compact session tree.
import type { OpenCodeEvent, PermissionRequest } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { captureSessionOwnership } from "@/session/session-ownership"
import { sessionPermissionRequest } from "@/session/requests/session-request-tree"
import { createPermissionNotifications } from "@/shell/notifications/notification"
import {
  groupSessionRequests,
  respondToRequest,
  settleRequest,
  rememberRequest,
  readSessionRequests,
  filterSettledRequests,
} from "./sync-compact"

const notifications = createPermissionNotifications()

function currentPermission(requests: Record<string, PermissionRequest[] | undefined>) {
  const sessions = state.session ? [state.session, ...state.recentSessions] : state.recentSessions
  return sessionPermissionRequest(sessions, requests, state.session?.id)
}

export function refreshPermissions() {
  const active = captureSessionOwnership()
  const session = state.session
  if (!active || !session) return Promise.resolve()

  return readSessionRequests(
    "permission",
    async (signal) =>
      (await active.client.permission.request.list({ location: { directory: sessionDirectory(session) } }, { signal }))
        .data,
  )
    .then((result) => {
      if (!active.current() || !result) return
      const requests = groupSessionRequests(result)
      setState("permission", reconcile(requests))
      notifications.clear()
      const request = currentPermission(requests)
      if (request) notifications.notify(request)
    })

    .catch((error) => {
      if (active.current()) throw error
    })
}

export function handlePermissionEvent(event: OpenCodeEvent) {
  if (event.type === "permission.asked") {
    const request = event.data
    if (!filterSettledRequests("permission", [request]).length) return true
    rememberRequest("permission", request)
    setState("permission", request.sessionID, (current = []) => [
      request,
      ...current.filter((item) => item.id !== request.id),
    ])
    if (currentPermission(state.permission)?.id === request.id) notifications.notify(request)
    return true
  }

  if (event.type === "permission.replied") {
    const replied = event.data
    settleRequest("permission", { sessionID: replied.sessionID, id: replied.requestID })
    notifications.forget(replied.requestID)
    setState("permission", replied.sessionID, (current = []) => current.filter((item) => item.id !== replied.requestID))
    return true
  }

  return false
}

export function decidePermission(request: PermissionRequest, response: "once" | "always" | "reject") {
  respondToRequest("permission", request, (client, signal) =>
    client.permission.reply({ sessionID: request.sessionID, requestID: request.id, decision: response }, { signal }),
  )
}
