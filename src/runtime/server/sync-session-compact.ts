// Single active-session SSE lifecycle, not the main app's multi-directory ServerSyncProvider.
import {
  activateSession,
  retrySessionActivation,
  initializeSessionSync as bootstrapSessionSync,
} from "./global-sync/bootstrap-session"
import { applySessionEvent } from "./global-sync/event-reducer-session"
import { handlePermissionEvent } from "@/session/requests/permission-sync-compact"
import { handleFormEvent } from "@/session/requests/form-sync-compact"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { currentDraft, currentRuntime, setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { bounded } from "./operation"
import { createLoadState, transitionLoad } from "./load-machine"
import { clearReadError, reportReadError } from "./read-errors"
import { createStreamState, transitionStream, type StreamEvent } from "./server-sync-machine"
import { abort } from "@opencode/util/abort"
import { readableError } from "@/shell/errors/readable"
import { sessionDirectory } from "@/session/directory"
import type { OpenCodeEvent } from "@opencode/client/promise"
import type { OpenCodeEventStream } from "./client-compact"

let streamAbort: AbortController | undefined
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
  abort(streamAbort)
  streamAbort = undefined
  dispatchStream({ type: "stop" })
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
  dispatchStream({ type: "start" })
  const attempt = stream.attempt
  const retire = () => {
    abort(controller)
    dispatchStream({ type: "ended", attempt })
  }
  runtime.signal.addEventListener("abort", retire, { once: true })
  void (async () => {
    const events = activeClient.event.subscribe({
      signal: controller.signal,
      onActivity: () => {
        if (!controller.signal.aborted) dispatchStream({ type: "activity", attempt })
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
      runtime.signal.removeEventListener("abort", retire)
      dispatchStream({ type: "ended", attempt })
    })
}

export function restartSessionEventStream() {
  startEventStream()
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
  stopEventStream()
  setSessionClient(undefined)
}

export { activateSession }
