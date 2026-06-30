import "@opencode-ai/ui/styles/tailwind"
import "@opencode-ai/ui/v2/styles/tailwind.css"
import "./styles.css"

import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { createOpencodeClient } from "@opencode-ai/sdk/client"
import type { Event, Message, Part, Session, SessionStatus } from "@opencode-ai/sdk"
import DOMPurify from "dompurify"
import { marked } from "marked"
import { createEffect, createMemo, For, onCleanup, onMount, Show } from "solid-js"
import { render } from "solid-js/web"
import { createStore } from "solid-js/store"

const AGENT_ID = "7777"
const HISTORY_DIALOG_LIMIT = 20
const FETCH_MESSAGE_LIMIT = HISTORY_DIALOG_LIMIT * 4
const SESSION_ID_KEY = "opencode.7777.session.id"
const SESSION_DIRECTORY_KEY = "opencode.7777.session.directory"

type LoadStatus = "loading" | "ready" | "failed"
type ServerInfo = {
  url: string
  username?: string
  password?: string
}
type SessionRecord = {
  id: string
  directory?: string
}
type HistoryItem = {
  info: Message
  parts: Part[]
}
type AppState = {
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

const [state, setState] = createStore<AppState>({
  status: "loading" as LoadStatus,
  server: undefined,
  session: undefined,
  sessionStatus: idleStatus,
  messages: [],
  prompt: "",
  submitting: false,
  error: "",
})

let client: ReturnType<typeof createOpencodeClient> | undefined
let streamAbort: AbortController | undefined
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let messageList: HTMLDivElement | undefined

function storageGet(key: string) {
  if (typeof localStorage !== "object") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

function readSessionRecord(): SessionRecord | undefined {
  const id = storageGet(SESSION_ID_KEY)
  if (!id) return
  return {
    id,
    directory: storageGet(SESSION_DIRECTORY_KEY) ?? undefined,
  }
}

function writeSessionRecord(session: Session) {
  storageSet(SESSION_ID_KEY, session.id)
  storageSet(SESSION_DIRECTORY_KEY, session.directory)
}

function authHeader(server: ServerInfo) {
  if (!server.password) return
  return {
    Authorization: `Basic ${btoa(`${server.username ?? "opencode"}:${server.password}`)}`,
  }
}

function makeClient(server: ServerInfo, directory?: string) {
  return createOpencodeClient({
    baseUrl: server.url,
    directory,
    headers: authHeader(server),
    throwOnError: true,
  })
}

function resolveServer(): Promise<ServerInfo> {
  if (window.api?.awaitInitialization) {
    return window.api.awaitInitialization().then((data) => ({
      url: data.url,
      username: data.username ?? undefined,
      password: data.password ?? undefined,
    }))
  }

  if (import.meta.env.DEV) {
    return Promise.resolve({
      url: `http://${import.meta.env.VITE_OPENCODE_SERVER_HOST ?? "localhost"}:${
        import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"
      }`,
    })
  }

  return Promise.resolve({ url: location.origin })
}

function restoreSession(baseClient: ReturnType<typeof createOpencodeClient>, record: SessionRecord | undefined) {
  if (!record) return Promise.resolve<Session | undefined>(undefined)
  return baseClient.session
    .get({
      path: { id: record.id },
      query: record.directory ? { directory: record.directory } : undefined,
    })
    .then((result) => result.data)
    .catch(() => undefined)
}

function createSession(baseClient: ReturnType<typeof createOpencodeClient>) {
  return baseClient.session
    .create({
      body: {
        title: "7777",
      },
    })
    .then((result) => {
      if (!result.data) throw new Error("Failed to create 7777 session")
      return result.data
    })
}

function normalizeHistory(items: { info: Message; parts: Part[] }[]): HistoryItem[] {
  return items
    .filter((item) => !!item.info?.id)
    .map((item) => ({
      info: item.info,
      parts: item.parts.filter((part) => !!part.id).sort(comparePart),
    }))
    .sort(compareHistoryItem)
}

function compareHistoryItem(a: HistoryItem, b: HistoryItem) {
  const diff = a.info.time.created - b.info.time.created
  if (diff !== 0) return diff
  return a.info.id < b.info.id ? -1 : a.info.id > b.info.id ? 1 : 0
}

function comparePart(a: Part, b: Part) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function recentDialogMessages(items: HistoryItem[]) {
  const userMessages = items.filter((item) => item.info.role === "user")
  if (userMessages.length <= HISTORY_DIALOG_LIMIT) return items
  const firstVisible = userMessages[userMessages.length - HISTORY_DIALOG_LIMIT]
  return items.filter((item) => item.info.time.created >= firstVisible.info.time.created)
}

function readableError(error: unknown) {
  if (!error) return "Request failed"
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (typeof error === "object" && "data" in error) {
    const data = error.data
    if (typeof data === "object" && data && "message" in data && typeof data.message === "string") return data.message
  }
  return String(error)
}

function isTextLikePart(part: Part): part is Extract<Part, { type: "text" | "reasoning" }> {
  return part.type === "text" || part.type === "reasoning"
}

function isToolPart(part: Part): part is Extract<Part, { type: "tool" }> {
  return part.type === "tool"
}

function messageText(parts: Part[]) {
  return parts
    .filter(isTextLikePart)
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n")
}

function renderMarkdown(value: string) {
  const parsed = marked.parse(value, { async: false })
  return DOMPurify.sanitize(typeof parsed === "string" ? parsed : value)
}

function toolStatus(part: Extract<Part, { type: "tool" }>) {
  if (part.state.status === "completed") return part.state.title || "Done"
  if (part.state.status === "error") return part.state.error
  if (part.state.status === "running") return part.state.title || "Running"
  return "Pending"
}

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

function handleEvent(event: Event) {
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

function initialize() {
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

function submitPrompt() {
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

function abortPrompt() {
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

function statusText(status: SessionStatus) {
  if (state.status === "loading") return "Starting"
  if (state.status === "failed") return "Offline"
  if (state.submitting) return "Sending"
  if (status.type === "busy") return "Working"
  if (status.type === "retry") return `Retry ${status.attempt}`
  return "Ready"
}

function MessageView(props: { item: HistoryItem }) {
  const text = createMemo(() => messageText(props.item.parts))
  const tools = createMemo(() => props.item.parts.filter(isToolPart))
  const role = createMemo(() => (props.item.info.role === "user" ? "You" : "7777"))

  return (
    <article class={`message message-${props.item.info.role}`}>
      <div class="message-avatar">{props.item.info.role === "user" ? "U" : "7"}</div>
      <div class="message-body">
        <div class="message-meta">{role()}</div>
        <Show when={text()} fallback={<div class="message-empty">...</div>}>
          {(value) => <div class="markdown" innerHTML={renderMarkdown(value())} />}
        </Show>
        <Show when={tools().length > 0}>
          <ul class="tool-list">
            <For each={tools()}>
              {(part) => (
                <li>
                  <span>{part.tool}</span>
                  <span>{toolStatus(part)}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </article>
  )
}

function App() {
  const visibleMessages = createMemo(() => recentDialogMessages(state.messages))
  const busy = createMemo(() => state.submitting || state.sessionStatus.type !== "idle")
  const canSubmit = createMemo(() => state.prompt.trim().length > 0 && !state.submitting && state.status === "ready")

  createEffect(() => {
    visibleMessages().length
    queueMicrotask(() => {
      if (!messageList) return
      messageList.scrollTop = messageList.scrollHeight
    })
  })

  onMount(() => {
    void initialize()
    onCleanup(() => {
      stopEventStream()
      if (refreshTimer) clearTimeout(refreshTimer)
    })
  })

  return (
    <div class="app-shell">
      <header class="topbar">
        <div>
          <h1>7777</h1>
          <p>{statusText(state.sessionStatus)}</p>
        </div>
        <div class="session-pill">
          <span>{visibleMessages().filter((item) => item.info.role === "user").length}</span>
          <span>/</span>
          <span>{HISTORY_DIALOG_LIMIT}</span>
        </div>
      </header>

      <main class="conversation" ref={messageList}>
        <Show
          when={state.status !== "loading"}
          fallback={
            <div class="loading">
              <Spinner class="loading-spinner" />
              <span>Starting 7777</span>
            </div>
          }
        >
          <Show
            when={visibleMessages().length > 0}
            fallback={
              <div class="empty-state">
                <div class="empty-mark">7777</div>
                <p>Ready</p>
              </div>
            }
          >
            <For each={visibleMessages()}>{(item) => <MessageView item={item} />}</For>
          </Show>
        </Show>
      </main>

      <Show when={state.error}>
        {(error) => (
          <div class="error-banner">
            <Icon name="warning" />
            <span>{error()}</span>
          </div>
        )}
      </Show>

      <form
        class="composer"
        onSubmit={(event) => {
          event.preventDefault()
          submitPrompt()
        }}
      >
        <textarea
          aria-label="Message"
          placeholder="Ask 7777"
          value={state.prompt}
          disabled={state.status !== "ready"}
          onInput={(event) => setState("prompt", event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return
            event.preventDefault()
            submitPrompt()
          }}
        />
        <button
          type={busy() ? "button" : "submit"}
          class="submit-button"
          aria-label={busy() ? "Stop" : "Send"}
          disabled={!busy() && !canSubmit()}
          onClick={() => {
            if (busy()) abortPrompt()
          }}
        >
          <Show when={busy()} fallback={<Icon name="arrow-up" />}>
            <Icon name="stop" />
          </Show>
        </button>
      </form>
    </div>
  )
}

const root = document.getElementById("root")
if (root instanceof HTMLElement) {
  render(() => <App />, root)
}
