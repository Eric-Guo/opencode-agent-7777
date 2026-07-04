import type { Event as OpencodeEvent } from "@opencode-ai/sdk"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { readSessionRecord, writeSessionRecord } from "@/context/local"
import { translateSync } from "@/context/language"
import { refreshModels } from "@/context/models"
import { handlePermissionEvent, refreshPermissions } from "@/context/permission"
import { makeClient, type OpencodeClient } from "@/context/sdk"
import {
  createSession,
  disposeSessionRefresh,
  handleSessionEvent,
  idleStatus,
  refreshMessages,
  restoreSession,
  scheduleRefresh as scheduleSessionRefresh,
  setSessionClient,
  setState,
  state,
} from "@/context/server-session"
import { resolveServer, type ServerInfo } from "@/context/server"
import { defaultSessionDirectory } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"
import { syncWindowBackgroundColor } from "@/utils/theme"

let streamAbort: AbortController | undefined
let creatingSession: Promise<void> | undefined

function refreshCurrentMessages() {
  return refreshMessages(FETCH_MESSAGE_LIMIT)
}

function scheduleMessageRefresh(delay = 120) {
  scheduleSessionRefresh(refreshCurrentMessages, delay)
}

export function scheduleRefresh(delay = 120) {
  scheduleMessageRefresh(delay)
}

function createDefaultSession(baseClient: OpencodeClient) {
  return baseClient.path.get().then((result) => {
    if (!result.data) throw new Error(translateSync("error.loadServerPathFailed"))
    const paths = result.data as typeof result.data & { home?: string }
    return createSession(baseClient, defaultSessionDirectory(paths.home ?? result.data.directory))
  })
}

function activateSession(server: ServerInfo, session: NonNullable<typeof state.session>) {
  writeSessionRecord(session)
  const activeClient = makeClient(server, session.directory)
  setSessionClient(activeClient)
  setState("session", session)
  setState("sessionStatus", idleStatus)
  setState("messages", [])
  setState("permissionRequest", undefined)
  setState("permissionResponding", false)
  setState("prompt", "")
  setState("attachments", [])
  setState("submitting", false)
  setState("status", "ready")
  syncWindowBackgroundColor()
  return Promise.all([refreshCurrentMessages(), refreshModels(activeClient, session), refreshPermissions()]).then(
    () => undefined,
  )
}

function handleEvent(event: OpencodeEvent) {
  if (handlePermissionEvent(event)) return
  handleSessionEvent(event, { refresh: scheduleMessageRefresh })
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
  const activeClient = makeClient(server, directory)
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
        .then((session) => activateSession(server, session))
    })
    .then(startEventStream)
    .catch((error) => {
      setState("status", "failed")
      setState("error", readableError(error))
    })
}

export function startNewSession() {
  if (creatingSession) return creatingSession

  const server = state.server
  const directory = state.session?.directory
  if (!server || !directory) {
    setState("error", translateSync("error.sessionNotReady"))
    return Promise.resolve()
  }

  setState("error", "")
  const baseClient = makeClient(server)
  creatingSession = createSession(baseClient, directory)
    .then((session) => activateSession(server, session))
    .then(startEventStream)
    .catch((error) => {
      setState("error", readableError(error))
    })
    .finally(() => {
      creatingSession = undefined
    })

  return creatingSession
}

export function disposeSessionSync() {
  stopEventStream()
  disposeSessionRefresh()
}
