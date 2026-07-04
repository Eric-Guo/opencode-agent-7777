import type { Event as OpencodeEvent, Permission } from "@opencode-ai/sdk"
import type { PermissionRequest as V2PermissionRequest } from "@opencode-ai/sdk/v2/client"
import { translateSync, type TranslationKey, type TranslationParams } from "@/context/language"
import { showPlatformNotification } from "@/context/platform"
import { scheduleRefresh } from "@/context/server-sync"
import { currentSession, setState, state } from "@/context/server-session"
import { readableError } from "@/utils/server-errors"
import { serverHttpHeaders, serverUrl } from "@/utils/server"

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

type Translator = (key: TranslationKey, params?: TranslationParams) => string

function permissionDescriptionKey(permission: string): TranslationKey {
  if (permission === "external_directory") return "permission.description.externalDirectory"
  if (permission === "grep") return "permission.description.grep"
  if (permission === "glob") return "permission.description.glob"
  if (permission === "list") return "permission.description.list"
  if (permission === "read") return "permission.description.read"
  if (permission === "bash") return "permission.description.bash"
  return "permission.description.default"
}

export function permissionDescription(permission: string, t: Translator = translateSync) {
  return t(permissionDescriptionKey(permission))
}

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
