import type { Event as OpencodeEvent } from "@opencode-ai/sdk"
import {
  activateSession,
  initializeSessionSync as bootstrapSessionSync,
  refreshCurrentMessages,
} from "./global-sync/bootstrap"
import { applySessionEvent } from "./global-sync/event-reducer"
import { disposeRefreshQueue, scheduleRefreshTask } from "./global-sync/queue"
import { handlePermissionEvent } from "@/context/permission"
import { createDirectorySdk } from "@/context/sdk"
import { setState, state } from "@/context/server-session"
import { readableError } from "@/utils/server-errors"

let streamAbort: AbortController | undefined

function scheduleMessageRefresh(delay = 120) {
  scheduleRefreshTask(refreshCurrentMessages, delay)
}

export function scheduleRefresh(delay = 120) {
  scheduleMessageRefresh(delay)
}

function handleEvent(event: OpencodeEvent) {
  if (handlePermissionEvent(event)) return
  applySessionEvent(event, { refresh: scheduleMessageRefresh })
}

function stopEventStream() {
  streamAbort?.abort()
  streamAbort = undefined
}

function startEventStream() {
  stopEventStream()
  const server = state.server
  const directory = state.session?.directory
  if (!server || !directory) return
  const activeClient = createDirectorySdk(server, directory).client
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
