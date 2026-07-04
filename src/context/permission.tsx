import type { Event as OpencodeEvent } from "@opencode-ai/sdk"
import { translateSync } from "@/context/language"
import { showPlatformNotification } from "@/context/platform"
import { scheduleRefresh } from "@/context/server-sync"
import { currentSession, setState, state } from "@/context/server-session"
import {
  permissionDescription,
  toPermissionView,
  toV2PermissionView,
  v2PermissionAsked,
  v2PermissionReplied,
  type PermissionRequestView,
  type V2PermissionLike,
} from "@/pages/session/composer/session-request-tree"
import { readableError } from "@/utils/server-errors"
import { serverHttpHeaders, serverUrl } from "@/utils/server"

function permissionNotificationBody(permission: PermissionRequestView) {
  if (permission.title) return permission.title
  return permissionDescription(permission.permission)
}

function notifyPermissionRequest(permission: PermissionRequestView) {
  if (alertedPermissionIDs.has(permission.id)) return
  alertedPermissionIDs.add(permission.id)

  const title = translateSync("permission.required")
  const body = permissionNotificationBody(permission)
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
  if (!active || !state.server) return Promise.resolve()

  return fetch(serverUrl(state.server, `/api/session/${encodeURIComponent(active.sessionID)}/permission`), {
    headers: serverHttpHeaders(state.server),
  })
    .then((response) => {
      if (!response.ok) throw new Error(translateSync("error.permissionsLoadFailed", { status: response.status }))
      return response.json() as Promise<{ data?: V2PermissionLike[] }>
    })
    .then((result) => {
      const request = result.data?.[0]
      setState("permissionRequest", request ? toV2PermissionView(request) : undefined)
      setState("permissionResponding", false)
    })
}

export function handlePermissionEvent(event: OpencodeEvent) {
  const asked = v2PermissionAsked(event)
  if (asked && asked.sessionID === state.session?.id) {
    const request = toV2PermissionView(asked)
    setState("permissionRequest", request)
    setState("permissionResponding", false)
    notifyPermissionRequest(request)
    return true
  }

  const replied = v2PermissionReplied(event)
  const repliedID = replied?.requestID ?? replied?.permissionID
  if (replied?.sessionID === state.session?.id && repliedID) {
    alertedPermissionIDs.delete(repliedID)
    setState("permissionRequest", (current) => (current?.id === repliedID ? undefined : current))
    setState("permissionResponding", false)
    return true
  }

  if (event.type === "permission.updated" && event.properties.sessionID === state.session?.id) {
    const request = toPermissionView(event.properties)
    setState("permissionRequest", request)
    setState("permissionResponding", false)
    notifyPermissionRequest(request)
    return true
  }

  if (event.type === "permission.replied" && event.properties.sessionID === state.session?.id) {
    alertedPermissionIDs.delete(event.properties.permissionID)
    setState("permissionRequest", (current) =>
      current?.id === event.properties.permissionID ? undefined : current,
    )
    setState("permissionResponding", false)
    return true
  }

  return false
}

export function decidePermission(response: "once" | "always" | "reject") {
  const active = currentSession()
  const request = state.permissionRequest
  if (!active || !request || state.permissionResponding || !state.server) return

  setState("error", "")
  setState("permissionResponding", true)
  const reply =
    request.replyTarget === "session"
      ? fetch(
          serverUrl(
            state.server,
            `/api/session/${encodeURIComponent(request.sessionID)}/permission/${encodeURIComponent(request.id)}/reply`,
          ),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...serverHttpHeaders(state.server),
            },
            body: JSON.stringify({ reply: response }),
          },
        ).then((result) => {
          if (!result.ok) throw new Error(translateSync("error.permissionsReplyFailed", { status: result.status }))
        })
      : active.client.postSessionIdPermissionsPermissionId({
          path: {
            id: request.sessionID,
            permissionID: request.id,
          },
          body: { response },
        })

  void reply
    .then(() => {
      setState("permissionRequest", (current) => (current?.id === request.id ? undefined : current))
      scheduleRefresh(120)
    })
    .catch((error) => {
      setState("error", readableError(error))
    })
    .finally(() => {
      setState("permissionResponding", false)
    })
}
