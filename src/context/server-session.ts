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
  const byID = new Map<string, HistoryItem>()
  for (const item of items) {
    if (!item.info?.id) continue
    byID.set(item.info.id, {
      info: item.info,
      parts: item.parts.filter((part) => !!part.id).sort(comparePart),
    })
  }
  return [...byID.values()].sort(compareHistoryItem)
}

function assistantParentIDs(items: HistoryItem[]) {
  const userIDs = new Set(items.filter((item) => item.info.role === "user").map((item) => item.info.id))
  return [
    ...new Set(
      items.flatMap((item) =>
        item.info.role === "assistant" && !userIDs.has(item.info.parentID) ? [item.info.parentID] : [],
      ),
    ),
  ]
}

function cachedParents(parentIDs: string[]) {
  const ids = new Set(parentIDs)
  return state.messages.filter((item) => item.info.role === "user" && ids.has(item.info.id))
}

async function fetchParentMessages(active: { client: OpencodeClient; sessionID: string }, parentIDs: string[]) {
  const cached = new Map(cachedParents(parentIDs).map((item) => [item.info.id, item] as const))
  const fetched = await Promise.all(
    parentIDs.map((messageID) =>
      active.client.session
        .message({
          path: { id: active.sessionID, messageID },
        })
        .then((result) => result.data)
        .catch(() => undefined),
    ),
  )
  const parents = new Map<string, HistoryItem>()
  for (const item of normalizeHistory(fetched.filter((item): item is { info: Message; parts: Part[] } => !!item))) {
    if (item.info.role === "user") parents.set(item.info.id, item)
  }
  for (const parentID of parentIDs) {
    if (!parents.has(parentID)) {
      const item = cached.get(parentID)
      if (item) parents.set(parentID, item)
    }
  }
  return normalizeHistory([...parents.values()])
}

async function hydrateAssistantParents(active: { client: OpencodeClient; sessionID: string }, items: HistoryItem[]) {
  const parentIDs = assistantParentIDs(items)
  if (parentIDs.length === 0) return items
  const parents = await fetchParentMessages(active, parentIDs)
  return normalizeHistory([...items, ...parents])
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
      return hydrateAssistantParents(active, normalizeHistory(result.data ?? []))
    })
    .then((messages) => {
      if (!messages || state.session?.id !== active.sessionID) return
      setState("messages", messages)
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
