// Single active-session SSE lifecycle, not the main app's multi-directory ServerSyncProvider.
import {
  activateSession,
  initializeSessionSync as bootstrapSessionSync,
  refreshCurrentMessages,
} from "./global-sync/bootstrap-session"
import { applySessionEvent } from "./global-sync/event-reducer-session"
import { disposeRefreshQueue, scheduleRefreshTask } from "./global-sync/queue-message-refresh"
import { handlePermissionEvent } from "@/session/requests/permission-sync-compact"
import { handleFormEvent } from "@/session/requests/form-sync-compact"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { sessionDirectory } from "@/session/directory"
import type { OpenCodeEvent } from "@opencode/client/promise"
import type { OpenCodeEventStream } from "./client-compact"

let streamAbort: AbortController | undefined
const listeners = new Set<(event: OpenCodeEvent) => void>()

export const sessionEvents: OpenCodeEventStream = {
  listen(handler) {
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  },
}

function scheduleMessageRefresh(delay = 120) {
  scheduleRefreshTask(refreshCurrentMessages, delay)
}

export function scheduleRefresh(delay = 120) {
  scheduleMessageRefresh(delay)
}

function handleEvent(event: OpenCodeEvent) {
  if (handlePermissionEvent(event)) return
  if (handleFormEvent(event)) return
  applySessionEvent(event, { refresh: scheduleMessageRefresh })
}

function stopEventStream() {
  streamAbort?.abort()
  streamAbort = undefined
  setState("eventsConnected", false)
}

function startEventStream() {
  stopEventStream()
  const server = state.server
  const directory = state.session ? sessionDirectory(state.session) : undefined
  if (!server || !directory) return
  const activeClient = createDirectorySdk(server, directory).client
  const controller = new AbortController()
  streamAbort = controller
  void (async () => {
    const events = activeClient.event.subscribe({
      signal: controller.signal,
      onActivity: () => {
        if (!controller.signal.aborted) setState("eventsConnected", true)
      },
    })
    for await (const event of events) {
      if (controller.signal.aborted) return
      handleEvent(event)
      listeners.forEach((handler) => handler(event))
    }
  })()
    .catch((error) => {
      if (!controller.signal.aborted) setState("error", readableError(error))
    })
    .finally(() => {
      if (streamAbort === controller) setState("eventsConnected", false)
    })
}

export function restartSessionEventStream() {
  startEventStream()
}

export function initializeSessionSync() {
  return bootstrapSessionSync()
    .then(restartSessionEventStream)
    .catch((error) => {
      setState("status", "failed")
      setState("error", readableError(error))
    })
}

export function disposeSessionSync() {
  stopEventStream()
  disposeRefreshQueue()
}

export { activateSession }
