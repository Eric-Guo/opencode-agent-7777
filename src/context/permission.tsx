import type { Event as OpencodeEvent, Permission } from "@opencode-ai/sdk"
import type { PermissionRequest as V2PermissionRequest } from "@opencode-ai/sdk/v2/client"
import { currentSession, scheduleRefresh, setState, state } from "@/context/sync"
import type { ServerInfo } from "@/context/server"
import { readableError } from "@/pages/session/helpers"

export type PermissionRequestView = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  title?: string
  replyTarget: "respond" | "session"
}

type V2PermissionAskedEvent = {
  type: "permission.asked"
  data?: V2PermissionLike
  properties?: V2PermissionLike
}

type V2PermissionRepliedEvent = {
  type: "permission.replied"
  data?: V2PermissionReplyLike
  properties?: V2PermissionReplyLike
}

type V2PermissionReplyLike = {
  sessionID?: string
  requestID?: string
  permissionID?: string
}

type V2PermissionLike = V2PermissionRequest & {
  action?: string
  resources?: string[]
}

function v2PermissionAsked(event: OpencodeEvent): V2PermissionLike | undefined {
  const candidate = event as unknown as V2PermissionAskedEvent
  if (candidate.type !== "permission.asked") return
  return candidate.data ?? candidate.properties
}

function v2PermissionReplied(event: OpencodeEvent): V2PermissionReplyLike | undefined {
  const candidate = event as unknown as V2PermissionRepliedEvent
  if (candidate.type !== "permission.replied") return
  return candidate.data ?? candidate.properties
}

function serverAuthHeader(server: ServerInfo): Record<string, string> {
  if (!server.password) return {}
  return {
    Authorization: `Basic ${btoa(`${server.username ?? "opencode"}:${server.password}`)}`,
  }
}

function serverUrl(path: string) {
  const server = state.server
  if (!server) throw new Error("Server is not ready")
  return `${server.url.replace(/\/$/, "")}${path}`
}

function toPermissionView(permission: Permission): PermissionRequestView {
  const pattern = permission.pattern
  return {
    id: permission.id,
    sessionID: permission.sessionID,
    permission: permission.type,
    patterns: pattern ? (Array.isArray(pattern) ? pattern : [pattern]) : [],
    title: permission.title,
    replyTarget: "respond",
  }
}

function toV2PermissionView(permission: V2PermissionLike): PermissionRequestView {
  const isSessionPermission = !!permission.action || !!permission.resources
  return {
    id: permission.id,
    sessionID: permission.sessionID,
    permission: permission.permission ?? permission.action ?? "permission",
    patterns: permission.patterns ?? permission.resources ?? [],
    replyTarget: isSessionPermission ? "session" : "respond",
  }
}

export function permissionDescription(permission: string) {
  if (permission === "external_directory") return "Access files outside the project directory"
  if (permission === "grep") return "Search file contents with a regular expression"
  if (permission === "glob") return "Match files with a glob pattern"
  if (permission === "list") return "List files in a directory"
  if (permission === "read") return "Read files matching the requested path"
  if (permission === "bash") return "Run a shell command"
  return "The agent needs permission to continue"
}

function permissionNotificationBody(permission: PermissionRequestView) {
  if (permission.title) return permission.title
  return permissionDescription(permission.permission)
}

function notifyPermissionRequest(permission: PermissionRequestView) {
  if (alertedPermissionIDs.has(permission.id)) return
  alertedPermissionIDs.add(permission.id)

  const title = "Permission required"
  const body = permissionNotificationBody(permission)
  if (window.api?.showNotification) {
    window.api.showNotification(title, body)
    return
  }
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

  return fetch(serverUrl(`/api/session/${encodeURIComponent(active.sessionID)}/permission`), {
    headers: serverAuthHeader(state.server),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load permissions: ${response.status}`)
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
            `/api/session/${encodeURIComponent(request.sessionID)}/permission/${encodeURIComponent(request.id)}/reply`,
          ),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...serverAuthHeader(state.server),
            },
            body: JSON.stringify({ reply: response }),
          },
        ).then((result) => {
          if (!result.ok) throw new Error(`Failed to respond to permission: ${result.status}`)
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
