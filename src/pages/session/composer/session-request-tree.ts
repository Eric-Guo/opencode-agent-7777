import type { OpenCodeEvent as OpencodeEvent, PermissionV2Request as V2PermissionRequest } from "@opencode-ai/client"
import { translateSync, type TranslationKey, type TranslationParams } from "@/context/language"

export type PermissionRequestView = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  title?: string
  replyTarget: "respond" | "session"
}

export type V2PermissionLike = V2PermissionRequest & {
  action?: string
  resources?: string[]
}

type V2PermissionAskedEvent = {
  type: "permission.v2.asked"
  data?: V2PermissionLike
  properties?: V2PermissionLike
}

type V2PermissionRepliedEvent = {
  type: "permission.v2.replied"
  data?: V2PermissionReplyLike
  properties?: V2PermissionReplyLike
}

export type V2PermissionReplyLike = {
  sessionID?: string
  requestID?: string
  permissionID?: string
}

export function v2PermissionAsked(event: OpencodeEvent): V2PermissionLike | undefined {
  const candidate = event as unknown as V2PermissionAskedEvent
  if (candidate.type !== "permission.v2.asked") return
  return candidate.data ?? candidate.properties
}

export function v2PermissionReplied(event: OpencodeEvent): V2PermissionReplyLike | undefined {
  const candidate = event as unknown as V2PermissionRepliedEvent
  if (candidate.type !== "permission.v2.replied") return
  return candidate.data ?? candidate.properties
}

export function toV2PermissionView(permission: V2PermissionLike): PermissionRequestView {
  return {
    id: permission.id,
    sessionID: permission.sessionID,
    permission: permission.action,
    patterns: permission.resources,
    replyTarget: "session",
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
