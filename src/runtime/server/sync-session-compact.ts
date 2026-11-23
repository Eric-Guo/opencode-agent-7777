// Single active-session SSE lifecycle, not the main app's multi-directory ServerSyncProvider.
import {
  activateSession,
  retrySessionActivation,
  initializeSessionSync as bootstrapSessionSync,
} from "./global-sync/bootstrap-session"
import { sessionRemoved } from "@/home/sessions/switcher-compact"
import { applySessionEvent } from "./global-sync/event-reducer-session"
import { handlePermissionEvent, refreshPermissions } from "@/session/requests/permission-sync-compact"
import { handleFormEvent, refreshForms } from "@/session/requests/form-sync-compact"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import {
  currentDraft,
  currentRuntime,
  isCurrentDirectory,
  setSessionClient,
  setState,
  state,
} from "@/runtime/server/session-store-compact"
import { bounded } from "./operation"
import { createLoadState, transitionLoad } from "./load-machine"
import { clearReadError, reportReadError } from "./read-errors"
import { startSessionConnection } from "./server-sync/connection"
import { abort } from "@opencode/util/abort"
import { readableError } from "@/shell/errors/readable"
import { sessionDirectory } from "@/session/directory"
import type { OpenCodeEvent } from "@opencode/client/promise"
import type { OpenCodeEventStream } from "./client-compact"

let streamAbort: AbortController | undefined
let initialization = createLoadState()
let bootstrapAbort: AbortController | undefined
const startupError = {}
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

function refreshPendingRequests() {
  const runtime = currentRuntime()
  const session = state.session
  if (!runtime || !session) return
  const directory = sessionDirectory(session)
  void Promise.all([refreshForms(), refreshPermissions("greeting")]).catch((error) => {
    if (currentRuntime() === runtime && isCurrentDirectory(directory)) setState("error", readableError(error))
  })
}

function handleEvent(event: OpenCodeEvent) {
  if (event.type === "session.deleted") {
    sessionRemoved(event.data.sessionID)
    return
  }
  if (handlePermissionEvent(event)) return
  if (handleFormEvent(event)) return
  const applied = applySessionEvent(event, { refresh: scheduleMessageRefresh })
  if (applied && event.type === "session.moved") refreshPendingRequests()
}

export function restartSessionEventStream() {
  abort(streamAbort)
  streamAbort = undefined
  const runtime = currentRuntime()
  const server = state.server
  const directory = state.session ? sessionDirectory(state.session) : undefined
  if (!server || !directory || !runtime?.alive()) return
  const client = createDirectorySdk(server, directory).client
  streamAbort = new AbortController()
  startSessionConnection({
    client,
    signal: AbortSignal.any([runtime.signal, streamAbort.signal]),
    connected: (value) => setState("eventsConnected", value),
    retry: restartSessionEventStream,
    greeting() {
      runtime.shells()?.refresh()
      scheduleMessageRefresh(0)
      refreshPendingRequests()
    },
    event(event) {
      if (event.type !== "server.connected") handleEvent(event)
      listeners.forEach((handler) => handler(event))
    },
  })
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
  abort(streamAbort)
  streamAbort = undefined
  setSessionClient(undefined)
}

export { activateSession }
