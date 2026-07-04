import type { Message, Part, Session, SessionStatus } from "@opencode-ai/sdk"
import { createStore } from "solid-js/store"
import { translateSync, type TranslationKey, type TranslationParams } from "@/context/language"
import type { ModelSelection } from "@/context/local"
import type { ModelLoadStatus, ModelOption } from "@/context/models"
import type { PermissionRequestView } from "@/pages/session/composer/session-request-tree"
import type { OpencodeClient } from "@/context/sdk"
import type { ServerInfo } from "@/context/server"

export type LoadStatus = "loading" | "ready" | "failed"

export type HistoryItem = {
  info: Message
  parts: Part[]
}

export type PromptAttachment = {
  id: string
  filename: string
  sourcePath?: string
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
  messagesLoading: boolean
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
  messagesLoading: false,
  models: [],
  selectedModel: undefined,
  permissionRequest: undefined,
  permissionResponding: false,
  prompt: "",
  attachments: [],
  submitting: false,
  error: "",
})

let client: OpencodeClient | undefined
let messageRefreshCount = 0

export function setSessionClient(next: OpencodeClient | undefined) {
  client = next
}

export function currentSession() {
  if (!client || !state.session) {
    setState("error", translateSync("error.sessionNotReady"))
    return
  }
  return {
    client,
    sessionID: state.session.id,
  }
}

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

export function refreshMessages(limit: number) {
  const active = currentSession()
  if (!active) return Promise.resolve()
  messageRefreshCount += 1
  setState("messagesLoading", true)
  return active.client.session
    .messages({
      path: { id: active.sessionID },
      query: { limit },
    })
    .then((result) => {
      if (state.session?.id !== active.sessionID) return
      setState("messages", normalizeHistory(result.data ?? []))
    })
    .finally(() => {
      messageRefreshCount = Math.max(0, messageRefreshCount - 1)
      if (messageRefreshCount === 0) setState("messagesLoading", false)
    })
}

export function statusText(
  t: (key: TranslationKey, params?: TranslationParams) => string,
  status: SessionStatus = state.sessionStatus,
) {
  if (state.status === "loading") return t("session.status.starting")
  if (state.status === "failed") return t("session.status.offline")
  if (state.submitting) return t("session.status.sending")
  if (status.type === "busy") return t("session.status.working")
  if (status.type === "retry") return t("session.status.retry", { attempt: status.attempt })
  return t("session.status.ready")
}
