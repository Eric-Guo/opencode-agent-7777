import type { Event as OpencodeEvent, Message, Part, Session, SessionStatus } from "@opencode-ai/sdk"
import { createStore } from "solid-js/store"
import { AGENT_ID, FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { readSessionRecord, writeSessionRecord } from "@/context/local"
import { createSession, restoreSession } from "@/context/server-session"
import { resolveServer, type ServerInfo } from "@/context/server"
import { makeClient, type OpencodeClient } from "@/context/sdk"
import {
  compareHistoryItem,
  comparePart,
  isTextLikePart,
  normalizeHistory,
  readableError,
  type HistoryItem,
} from "@/pages/session/helpers"

export type LoadStatus = "loading" | "ready" | "failed"

export type AppState = {
  status: LoadStatus
  server: ServerInfo | undefined
  session: Session | undefined
  sessionStatus: SessionStatus
  messages: HistoryItem[]
  prompt: string
  submitting: boolean
  error: string
}

const idleStatus = { type: "idle" } satisfies SessionStatus

export const [state, setState] = createStore<AppState>({
  status: "loading" as LoadStatus,
  server: undefined,
  session: undefined,
  sessionStatus: idleStatus,
  messages: [],
  prompt: "",
  submitting: false,
  error: "",
})

let client: OpencodeClient | undefined
let streamAbort: AbortController | undefined
let refreshTimer: ReturnType<typeof setTimeout> | undefined

function currentSession() {
  if (!client || !state.session) {
    setState("error", "Session is not ready")
    return
  }
  return {
    client,
    sessionID: state.session.id,
  }
}

function refreshMessages() {
  const active = currentSession()
  if (!active) return Promise.resolve()
  return active.client.session
    .messages({
      path: { id: active.sessionID },
      query: { limit: FETCH_MESSAGE_LIMIT },
    })
    .then((result) => {
      setState("messages", normalizeHistory(result.data ?? []))
    })
}

function scheduleRefresh(delay = 120) {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined
    void refreshMessages().catch((error) => setState("error", readableError(error)))
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

function upsertPart(part: Part, delta: string | undefined) {
  const hasMessage = state.messages.some((item) => item.info.id === part.messageID)
  if (!hasMessage) {
    scheduleRefresh()
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

function handleEvent(event: OpencodeEvent) {
  if (event.type === "session.updated" && event.properties.info.id === state.session?.id) {
    setState("session", event.properties.info)
    return
  }
  if (event.type === "message.updated" && event.properties.info.sessionID === state.session?.id) {
    upsertMessage(event.properties.info)
    return
  }
  if (event.type === "message.removed" && event.properties.sessionID === state.session?.id) {
    setState("messages", (items) => items.filter((item) => item.info.id !== event.properties.messageID))
    return
  }
  if (event.type === "message.part.updated" && event.properties.part.sessionID === state.session?.id) {
    upsertPart(event.properties.part, event.properties.delta)
    return
  }
  if (event.type === "message.part.removed" && event.properties.sessionID === state.session?.id) {
    setState("messages", (items) =>
      items.map((item) =>
        item.info.id === event.properties.messageID
          ? { ...item, parts: item.parts.filter((part) => part.id !== event.properties.partID) }
          : item,
      ),
    )
    return
  }
  if (event.type === "session.status" && event.properties.sessionID === state.session?.id) {
    setState("sessionStatus", event.properties.status)
    return
  }
  if (event.type === "session.idle" && event.properties.sessionID === state.session?.id) {
    setState("sessionStatus", idleStatus)
    scheduleRefresh()
    return
  }
  if (event.type === "session.error" && (!event.properties.sessionID || event.properties.sessionID === state.session?.id)) {
    setState("error", readableError(event.properties.error))
  }
}

function stopEventStream() {
  streamAbort?.abort()
  streamAbort = undefined
}

function startEventStream() {
  stopEventStream()
  const activeClient = client
  if (!activeClient) return
  const controller = new AbortController()
  streamAbort = controller
  void (async () => {
    const events = await activeClient.event.subscribe({
      signal: controller.signal,
      sseMaxRetryAttempts: 5,
      onSseError: (error) => {
        if (!controller.signal.aborted) console.error("[7777] event stream error", error)
      },
    })
    for await (const event of events.stream) {
      if (controller.signal.aborted) return
      handleEvent(event)
    }
  })().catch((error) => {
    if (!controller.signal.aborted) setState("error", readableError(error))
  })
}

export function initializeSessionSync() {
  setState("status", "loading")
  return resolveServer()
    .then((server) => {
      setState("server", server)
      const baseClient = makeClient(server)
      return restoreSession(baseClient, readSessionRecord())
        .then((session) => session ?? createSession(baseClient))
        .then((session) => {
          writeSessionRecord(session)
          client = makeClient(server, session.directory)
          setState("session", session)
          setState("status", "ready")
          void window.api?.setBackgroundColor?.("#f7f7f4")
          return refreshMessages()
        })
    })
    .then(startEventStream)
    .catch((error) => {
      setState("status", "failed")
      setState("error", readableError(error))
    })
}

function appendOptimisticMessage(text: string) {
  const active = currentSession()
  if (!active) return
  const id = `local-${Date.now()}`
  setState("messages", (items) => [
    ...items,
    {
      info: {
        id,
        sessionID: active.sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: AGENT_ID,
        model: { providerID: "", modelID: "" },
      },
      parts: [
        {
          id: `${id}-text`,
          sessionID: active.sessionID,
          messageID: id,
          type: "text",
          text,
        },
      ],
    },
  ])
}

export function setPrompt(value: string) {
  setState("prompt", value)
}

export function submitPrompt() {
  const active = currentSession()
  const text = state.prompt.trim()
  if (!active || !text || state.submitting) return

  setState("prompt", "")
  setState("error", "")
  setState("submitting", true)
  setState("sessionStatus", { type: "busy" })
  appendOptimisticMessage(text)

  void active.client.session
    .promptAsync({
      path: { id: active.sessionID },
      body: {
        agent: AGENT_ID,
        parts: [{ type: "text", text }],
      },
    })
    .then(() => scheduleRefresh(250))
    .catch((error) => {
      setState("error", readableError(error))
      setState("sessionStatus", idleStatus)
      scheduleRefresh(0)
    })
    .finally(() => setState("submitting", false))
}

export function abortPrompt() {
  const active = currentSession()
  if (!active) return
  void active.client.session
    .abort({
      path: { id: active.sessionID },
    })
    .catch((error) => setState("error", readableError(error)))
    .finally(() => {
      setState("submitting", false)
      scheduleRefresh()
    })
}

export function statusText(status: SessionStatus) {
  if (state.status === "loading") return "Starting"
  if (state.status === "failed") return "Offline"
  if (state.submitting) return "Sending"
  if (status.type === "busy") return "Working"
  if (status.type === "retry") return `Retry ${status.attempt}`
  return "Ready"
}

export function disposeSessionSync() {
  stopEventStream()
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = undefined
  }
}
