// Imperative directory request sync and replies for the compact session tree.
import type { OpenCodeEvent, PermissionRequest } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { translateSync, type TranslationKey } from "@/runtime/i18n/language"
import { showPlatformNotification } from "@/runtime/platform/platform-bridge"
import { currentSession, currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { sessionPermissionRequest } from "@/session/requests/session-request-tree"
import { groupSessionRequests, respondToRequest } from "./sync-compact"

function permissionDescription(permission: string) {
  const key = `settings.permissions.tool.${permission}.description` as TranslationKey
  const value = translateSync(key)
  if (value === key) return translateSync("notification.permission.title")
  return value
}

function currentPermission(requests: Record<string, PermissionRequest[] | undefined>) {
  const sessions = state.session ? [state.session, ...state.recentSessions] : state.recentSessions
  return sessionPermissionRequest(sessions, requests, state.session?.id)
}

function notifyPermissionRequest(permission: PermissionRequest) {
  if (alertedPermissionIDs.has(permission.id)) return
  alertedPermissionIDs.add(permission.id)

  const title = translateSync("notification.permission.title")
  const body = permissionDescription(permission.action)
  if (showPlatformNotification(title, body)) return
  if (!("Notification" in window)) return

  void (async () => {
    const result =
      Notification.permission === "default"
        ? await Notification.requestPermission().catch(() => "denied" as NotificationPermission)
        : Notification.permission
    if (result === "granted") new Notification(title, { body })
  })()
}

const alertedPermissionIDs = new Set<string>()

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
      alertedPermissionIDs.clear()
      const request = currentPermission(requests)
      if (request) notifyPermissionRequest(request)
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
    if (currentPermission(state.permission)?.id === request.id) notifyPermissionRequest(request)
    return true
  }

  if (event.type === "permission.replied") {
    const replied = event.data
    alertedPermissionIDs.delete(replied.requestID)
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
