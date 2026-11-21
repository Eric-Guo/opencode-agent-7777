// Imperative directory request sync and replies for the compact session tree.
import type { OpenCodeEvent, PermissionRequest } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { captureSessionOwnership } from "@/session/session-ownership"
import { sessionPermissionRequest } from "./session-request-tree"
import { createPermissionNotifications } from "@/shell/notifications/notification"
import {
  groupSessionRequests,
  requestSessions,
  respondToRequest,
  settleRequest,
  rememberRequest,
  readSessionRequests,
  filterSettledRequests,
} from "./sync-compact"

type Owner = NonNullable<ReturnType<typeof captureSessionOwnership>>
const notificationControllers = new WeakMap<Owner["runtime"], ReturnType<typeof createPermissionNotifications>>()

function currentPermission(
  requests: Record<string, PermissionRequest[] | undefined>,
  include?: (request: PermissionRequest) => boolean,
) {
  const sessions = requestSessions()
  return sessionPermissionRequest(sessions, requests, sessions[0]?.id, include)
}

export function notifyCurrentPermission(request: PermissionRequest) {
  const active = captureSessionOwnership()
  if (active?.current()) notificationsFor(active).notify(request)
}

function notificationsFor(active: Owner) {
  const existing = notificationControllers.get(active.runtime)
  if (existing) return existing
  const notifications = createPermissionNotifications({
    signal: active.runtime.signal,
    eligible: (request) =>
      active.current() &&
      !!currentPermission(state.permission, (item) => item.sessionID === request.sessionID && item.id === request.id),
  })
  notificationControllers.set(active.runtime, notifications)
  return notifications
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
      notificationControllers.get(active.runtime)?.clear()
      const request = currentPermission(requests)
      if (request) notificationsFor(active).notify(request)
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
    const selected = currentPermission(state.permission)
    if (selected?.id === request.id && selected.sessionID === request.sessionID) notifyCurrentPermission(request)
    return true
  }

  if (event.type === "permission.replied") {
    const replied = event.data
    const request = { sessionID: replied.sessionID, id: replied.requestID }
    settleRequest("permission", request)
    const runtime = currentRuntime()
    if (runtime) notificationControllers.get(runtime)?.forget(request)
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
