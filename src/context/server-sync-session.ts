// Single active-session SSE lifecycle, not the main app's multi-directory ServerSyncProvider.
import type { OpenCodeEvent as OpencodeEvent } from "@opencode-ai/client"
import {
  activateSession,
  initializeSessionSync as bootstrapSessionSync,
  refreshCurrentMessages,
} from "./global-sync/bootstrap-session"
import { applySessionEvent } from "./global-sync/event-reducer-session"
import { disposeRefreshQueue, scheduleRefreshTask } from "./global-sync/queue-message-refresh"
import { handlePermissionEvent } from "@/context/permission-sync"
import { handleQuestionEvent } from "@/context/question"
import { createDirectorySdk } from "@/context/sdk-directory-client"
import { setState, state } from "@/context/server-session-store"
import { readableError } from "@/utils/server-errors"
import { sessionDirectory } from "@/context/session-directory"

let streamAbort: AbortController | undefined

function scheduleMessageRefresh(delay = 120) {
  scheduleRefreshTask(refreshCurrentMessages, delay)
}

export function scheduleRefresh(delay = 120) {
  scheduleMessageRefresh(delay)
}

function handleEvent(event: OpencodeEvent) {
  if (handlePermissionEvent(event)) return
  if (handleQuestionEvent(event)) return
  applySessionEvent(event, { refresh: scheduleMessageRefresh })
}

function stopEventStream() {
  streamAbort?.abort()
  streamAbort = undefined
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
    const events = activeClient.event.subscribe({ signal: controller.signal })
    for await (const event of events) {
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
