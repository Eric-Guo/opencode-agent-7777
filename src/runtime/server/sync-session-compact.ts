// Single active-session SSE lifecycle, not the main app's multi-directory ServerSyncProvider.
import { activateSession, initializeSessionSync as bootstrapSessionSync } from "./global-sync/bootstrap-session"
import { applySessionEvent } from "./global-sync/event-reducer-session"
import { handlePermissionEvent } from "@/session/requests/permission-sync-compact"
import { handleFormEvent } from "@/session/requests/form-sync-compact"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { currentRuntime, setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { sessionDirectory } from "@/session/directory"
import type { OpenCodeEvent } from "@opencode/client/promise"
import type { OpenCodeEventStream } from "./client-compact"

let streamAbort: AbortController | undefined
let initialization = 0
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
  currentRuntime()?.schedule(delay)
}

export function scheduleRefresh(delay = 120) {
  scheduleMessageRefresh(delay)
}

function handleEvent(event: OpenCodeEvent) {
  if (event.type === "server.connected") {
    scheduleMessageRefresh(0)
    return
  }
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
  const runtime = currentRuntime()
  const server = state.server
  const directory = state.session ? sessionDirectory(state.session) : undefined
  if (!server || !directory || !runtime?.alive()) return
  const activeClient = createDirectorySdk(server, directory).client
  const controller = new AbortController()
  streamAbort = controller
  runtime.signal.addEventListener("abort", () => controller.abort(), { once: true })
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
  const version = ++initialization
  const current = () => version === initialization
  return bootstrapSessionSync(current)
    .then(() => {
      if (current()) restartSessionEventStream()
    })
    .catch((error) => {
      if (!current()) return
      setState("status", "failed")
      setState("error", readableError(error))
    })
}

export function disposeSessionSync() {
  initialization++
  stopEventStream()
  setSessionClient(undefined)
}

export { activateSession }
