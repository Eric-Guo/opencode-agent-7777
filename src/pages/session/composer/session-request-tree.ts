import type { OpenCodeEvent as OpencodeEvent, PermissionRequest } from "@opencode-ai/client"
import { translateSync, type TranslationKey, type TranslationParams } from "@/context/language"

export type PermissionRequestView = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  title?: string
  replyTarget: "respond" | "session"
}

export function permissionAsked(event: OpencodeEvent): PermissionRequest | undefined {
  if (event.type !== "permission.asked") return
  return event.data
}

export function permissionReplied(event: OpencodeEvent) {
  if (event.type !== "permission.replied") return
  return event.data
}

export function toV2PermissionView(permission: PermissionRequest): PermissionRequestView {
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
