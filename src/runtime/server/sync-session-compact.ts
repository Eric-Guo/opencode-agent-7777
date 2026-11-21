// Single active-session SSE lifecycle, not the main app's multi-directory ServerSyncProvider.
import {
  activateSession,
  retrySessionActivation,
  initializeSessionSync as bootstrapSessionSync,
} from "./global-sync/bootstrap-session"
import { sessionRemoved } from "@/home/sessions/switcher-compact"
import { applySessionEvent } from "./global-sync/event-reducer-session"
import { handlePermissionEvent } from "@/session/requests/permission-sync-compact"
import { handleFormEvent, refreshForms } from "@/session/requests/form-sync-compact"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { currentDraft, currentRuntime, setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { bounded } from "./operation"
import { createLoadState, transitionLoad } from "./load-machine"
import { clearReadError, reportReadError } from "./read-errors"
import { createStreamState, transitionStream, type StreamEvent } from "./server-sync-machine"
import { defaultIdleTimeout } from "@opencode/client/solid"
import { abort } from "@opencode/util/abort"
import { readableError } from "@/shell/errors/readable"
import { sessionDirectory } from "@/session/directory"
import type { OpenCodeEvent } from "@opencode/client/promise"
import type { OpenCodeEventStream } from "./client-compact"

const INITIAL_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000
let stopEventStream: (() => void) | undefined
let initialization = createLoadState()
let bootstrapAbort: AbortController | undefined
let stream = createStreamState()
const startupError = {}
function dispatchStream(event: StreamEvent) {
  stream = transitionStream(stream, event)
  setState("eventsConnected", stream.status === "live")
}
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

function refreshPendingForms() {
  void refreshForms().catch((error) => setState("error", readableError(error)))
}

function handleEvent(event: OpenCodeEvent) {
  if (event.type === "server.connected") {
    scheduleMessageRefresh(0)
    // Pick up forms created or settled between the activation read and the live stream, or while disconnected.
    refreshPendingForms()
    return
  }
  if (event.type === "session.deleted") {
    sessionRemoved(event.data.sessionID)
    return
  }
  if (handlePermissionEvent(event)) return
  if (handleFormEvent(event)) return
  const applied = applySessionEvent(event, { refresh: scheduleMessageRefresh })
  if (applied && event.type === "session.moved") refreshPendingForms()
}

export function restartSessionEventStream() {
  stopEventStream?.()
  const runtime = currentRuntime()
  const server = state.server
  const directory = state.session ? sessionDirectory(state.session) : undefined
  if (!server || !directory || !runtime?.alive()) return
  const client = createDirectorySdk(server, directory).client
  let request: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let delay = INITIAL_RETRY_MS

  const stop = () => {
    stopEventStream = undefined
    runtime.signal.removeEventListener("abort", stop)
    clearTimeout(timer)
    abort(request)
    clearReadError(stop)
    dispatchStream({ type: "stop" })
  }

  async function connect() {
    if (stopEventStream !== stop) return
    const controller = new AbortController()
    request = controller
    dispatchStream({ type: "start" })
    const attempt = stream.attempt
    // Heartbeats are SSE comments. Count bytes even when there is no application event.
    const watch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => abort(controller), defaultIdleTimeout)
    }
    watch()
    try {
      const events = client.event.subscribe({
        signal: controller.signal,
        onActivity: () => {
          if (controller.signal.aborted) return
          watch()
          if (stream.status === "live") return
          delay = INITIAL_RETRY_MS
          clearReadError(stop)
          dispatchStream({ type: "activity", attempt })
        },
      })
      for await (const event of events) {
        if (controller.signal.aborted) break
        handleEvent(event)
        listeners.forEach((handler) => handler(event))
      }
    } catch (error) {
      if (!controller.signal.aborted) reportReadError(stop, error, restartSessionEventStream)
    } finally {
      abort(controller)
      if (stopEventStream === stop) {
        clearTimeout(timer)
        timer = setTimeout(connect, delay)
        delay = Math.min(MAX_RETRY_MS, delay * 2)
        dispatchStream({ type: "ended", attempt })
      }
    }
  }

  stopEventStream = stop
  runtime.signal.addEventListener("abort", stop, { once: true })
  void connect()
}

export function initializeSessionSync() {
  initialization = transitionLoad(initialization, { type: "started" })
  const attempt = initialization.attempt
  abort(bootstrapAbort)
  const controller = new AbortController()
  bootstrapAbort = controller
  const current = () => initialization.status === "loading" && initialization.attempt === attempt
  clearReadError(startupError)
  let releaseOwner: (() => void) | undefined
  const attached = (signal: AbortSignal) => {
    const retire = () => {
      if (!current()) return
      initialization = transitionLoad(initialization, { type: "disposed" })
      abort(controller)
    }
    signal.addEventListener("abort", retire, { once: true })
    releaseOwner = () => signal.removeEventListener("abort", retire)
  }
  return bounded((signal) => bootstrapSessionSync(() => current() && !signal.aborted, signal, attached), {
    signal: controller.signal,
  })
    .then(() => {
      if (!current()) return
      initialization = transitionLoad(initialization, { type: "succeeded", attempt })
      restartSessionEventStream()
    })
    .catch((error) => {
      if (!current()) return
      initialization = transitionLoad(initialization, { type: "failed", attempt, error })
      setState("status", "failed")
      reportReadError(startupError, error, () => {
        // An attached session retries its reads without restoring over the current draft.
        const runtime = currentRuntime() ?? currentDraft()
        if (runtime) {
          clearReadError(startupError)
          void retrySessionActivation()
            .then(() => {
              if ((currentRuntime() ?? currentDraft()) === runtime) {
                setState("status", "ready")
                restartSessionEventStream()
              }
            })
            .catch(() => {})
        } else void initializeSessionSync()
      })
      restartSessionEventStream()
    })
    .finally(() => releaseOwner?.())
}

export function disposeSessionSync() {
  initialization = transitionLoad(initialization, { type: "disposed" })
  abort(bootstrapAbort)
  clearReadError(startupError)
  stopEventStream?.()
  setSessionClient(undefined)
}

export { activateSession }
