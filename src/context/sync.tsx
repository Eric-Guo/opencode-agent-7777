import type { Message, Part, Session, SessionStatus } from "@opencode-ai/sdk"
import { createStore } from "solid-js/store"
import type { ModelSelection } from "@/context/local"
import type { ModelLoadStatus, ModelOption } from "@/context/models"
import type { PermissionRequestView } from "@/context/permission"
import type { ServerInfo } from "@/context/server"

export type LoadStatus = "loading" | "ready" | "failed"

export type HistoryItem = {
  info: Message
  parts: Part[]
}

export type PromptAttachment = {
  id: string
  filename: string
  mime: string
  url: string
}

export type AppState = {
  status: LoadStatus
  modelStatus: ModelLoadStatus
  server: ServerInfo | undefined
  session: Session | undefined
  sessionStatus: SessionStatus
  messages: HistoryItem[]
  models: ModelOption[]
  selectedModel: ModelSelection | undefined
  permissionRequest: PermissionRequestView | undefined
  permissionResponding: boolean
  prompt: string
  attachments: PromptAttachment[]
  submitting: boolean
  error: string
}

export const idleStatus = { type: "idle" } satisfies SessionStatus

export const [state, setState] = createStore<AppState>({
  status: "loading",
  modelStatus: "loading",
  server: undefined,
  session: undefined,
  sessionStatus: idleStatus,
  messages: [],
  models: [],
  selectedModel: undefined,
  permissionRequest: undefined,
  permissionResponding: false,
  prompt: "",
  attachments: [],
  submitting: false,
  error: "",
})

export function normalizeHistory(items: { info: Message; parts: Part[] }[]): HistoryItem[] {
  return items
    .filter((item) => !!item.info?.id)
    .map((item) => ({
      info: item.info,
      parts: item.parts.filter((part) => !!part.id).sort(comparePart),
    }))
    .sort(compareHistoryItem)
}

export function compareHistoryItem(a: HistoryItem, b: HistoryItem) {
  const diff = a.info.time.created - b.info.time.created
  if (diff !== 0) return diff
  return a.info.id < b.info.id ? -1 : a.info.id > b.info.id ? 1 : 0
}

export function comparePart(a: Part, b: Part) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
