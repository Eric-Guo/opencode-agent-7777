import type { Event as OpencodeEvent, Message, Part, Session, SessionStatus } from "@opencode-ai/sdk"
import { createStore } from "solid-js/store"
import { translateSync, type TranslationKey, type TranslationParams } from "@/context/language"
import type { ModelSelection, SessionRecord } from "@/context/local"
import type { ModelLoadStatus, ModelOption } from "@/context/models"
import type { PermissionRequestView } from "@/pages/session/composer/session-request-tree"
import type { OpencodeClient } from "@/context/sdk"
import { normalizeSessionDirectory } from "@/context/session-directory"
import type { ServerInfo } from "@/context/server"
import { readableError } from "@/utils/server-errors"

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
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let messageRefreshCount = 0

function isTextPart(part: Part): part is Extract<Part, { type: "text" }> {
  return part.type === "text"
}

function isReasoningPart(part: Part): part is Extract<Part, { type: "reasoning" }> {
  return part.type === "reasoning"
}

function isTextLikePart(part: Part): part is Extract<Part, { type: "text" | "reasoning" }> {
  return isTextPart(part) || isReasoningPart(part)
}

export function setSessionClient(next: OpencodeClient | undefined) {
  client = next
}

export function restoreSession(baseClient: OpencodeClient, record: SessionRecord | undefined) {
  if (!record) return Promise.resolve<Session | undefined>(undefined)
  const directory = record.directory ? normalizeSessionDirectory(record.directory) : undefined
  return baseClient.session
    .get({
      path: { id: record.id },
      query: directory ? { directory } : undefined,
    })
    .then((result) => result.data)
    .catch(() => undefined)
}

export function createSession(baseClient: OpencodeClient, directory: string) {
  return baseClient.session
    .create({
      query: { directory: normalizeSessionDirectory(directory) },
      body: {
        title: "7777",
      },
    })
    .then((result) => {
      if (!result.data) throw new Error(translateSync("error.createSessionFailed"))
      return result.data
    })
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

export function scheduleRefresh(refresh: () => Promise<void>, delay = 120) {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined
    void refresh().catch((error) => setState("error", readableError(error)))
  }, delay)
}

function upsertMessage(info: Message) {
  setState("messages", (items) => {
    const withoutLocal = info.role === "user" ? items.filter((item) => !item.info.id.startsWith("local-")) : items
    const index = withoutLocal.findIndex((item) => item.info.id === info.id)
    if (index === -1) return [...withoutLocal, { info, parts: [] }].sort(compareHistoryItem)
    return withoutLocal.map((item, itemIndex) => (itemIndex === index ? { ...item, info } : item))
  })
}

function mergePart(existing: Part | undefined, incoming: Part, delta: string | undefined): Part {
  if (!delta) return incoming
  if (!existing) return incoming
  if (!isTextLikePart(existing) || !isTextLikePart(incoming)) return incoming
  if (incoming.text.length >= existing.text.length) return incoming
  return {
    ...incoming,
    text: `${existing.text}${delta}`,
  }
}

function upsertPart(part: Part, delta: string | undefined, refresh: () => void) {
  const hasMessage = state.messages.some((item) => item.info.id === part.messageID)
  if (!hasMessage) {
    refresh()
    return
  }
  setState("messages", (items) =>
    items.map((item) => {
      if (item.info.id !== part.messageID) return item
      const index = item.parts.findIndex((current) => current.id === part.id)
      if (index === -1) return { ...item, parts: [...item.parts, part].sort(comparePart) }
      const parts = item.parts.map((current, partIndex) =>
        partIndex === index ? mergePart(current, part, delta) : current,
      )
      return { ...item, parts: parts.sort(comparePart) }
    }),
  )
}

export function handleSessionEvent(event: OpencodeEvent, input: { refresh: () => void }) {
  if (event.type === "session.updated" && event.properties.info.id === state.session?.id) {
    setState("session", event.properties.info)
    return true
  }
  if (event.type === "message.updated" && event.properties.info.sessionID === state.session?.id) {
    upsertMessage(event.properties.info)
    return true
  }
  if (event.type === "message.removed" && event.properties.sessionID === state.session?.id) {
    setState("messages", (items) => items.filter((item) => item.info.id !== event.properties.messageID))
    return true
  }
  if (event.type === "message.part.updated" && event.properties.part.sessionID === state.session?.id) {
    upsertPart(event.properties.part, event.properties.delta, input.refresh)
    return true
  }
  if (event.type === "message.part.removed" && event.properties.sessionID === state.session?.id) {
    setState("messages", (items) =>
      items.map((item) =>
        item.info.id === event.properties.messageID
          ? { ...item, parts: item.parts.filter((part) => part.id !== event.properties.partID) }
          : item,
      ),
    )
    return true
  }
  if (event.type === "session.status" && event.properties.sessionID === state.session?.id) {
    setState("sessionStatus", event.properties.status)
    return true
  }
  if (event.type === "session.idle" && event.properties.sessionID === state.session?.id) {
    setState("sessionStatus", idleStatus)
    input.refresh()
    return true
  }
  if (
    event.type === "session.error" &&
    (!event.properties.sessionID || event.properties.sessionID === state.session?.id)
  ) {
    setState("error", readableError(event.properties.error))
    return true
  }
  return false
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

export function disposeSessionRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = undefined
  }
}
