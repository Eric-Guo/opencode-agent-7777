import type { Event as OpencodeEvent, Message, Part, SessionStatus } from "@opencode-ai/sdk"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { readSessionRecord, writeSessionRecord } from "@/context/local"
import { refreshModels } from "@/context/models"
import { handlePermissionEvent, refreshPermissions } from "@/context/permission"
import { makeClient, type OpencodeClient } from "@/context/sdk"
import { resolveServer } from "@/context/server"
import { createSession, restoreSession } from "@/context/server-session"
import { defaultSessionDirectory } from "@/context/session-directory"
import {
  compareHistoryItem,
  comparePart,
  isTextLikePart,
  normalizeHistory,
  readableError,
} from "@/pages/session/helpers"
import { idleStatus, setState, state } from "@/pages/session/session-state"

let client: OpencodeClient | undefined
let streamAbort: AbortController | undefined
let refreshTimer: ReturnType<typeof setTimeout> | undefined

export function currentSession() {
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

function createDefaultSession(baseClient: OpencodeClient) {
  return baseClient.path.get().then((result) => {
    if (!result.data) throw new Error("Failed to load server path")
    const paths = result.data as typeof result.data & { home?: string }
    return createSession(baseClient, defaultSessionDirectory(paths.home ?? result.data.directory))
  })
}

export function scheduleRefresh(delay = 120) {
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
  if (handlePermissionEvent(event)) return

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
  if (
    event.type === "session.error" &&
    (!event.properties.sessionID || event.properties.sessionID === state.session?.id)
  ) {
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
  setState("modelStatus", "loading")
  return resolveServer()
    .then((server) => {
      setState("server", server)
      const baseClient = makeClient(server)
      return restoreSession(baseClient, readSessionRecord())
        .then((session) => session ?? createDefaultSession(baseClient))
        .then((session) => {
          writeSessionRecord(session)
          client = makeClient(server, session.directory)
          setState("session", session)
          setState("status", "ready")
          void window.api?.setBackgroundColor?.("#111112")
          return Promise.all([refreshMessages(), refreshModels(client, session), refreshPermissions()]).then(
            () => undefined,
          )
        })
    })
    .then(startEventStream)
    .catch((error) => {
      setState("status", "failed")
      setState("error", readableError(error))
    })
}

export function statusText(status: SessionStatus = state.sessionStatus) {
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
