// Single-session bootstrap variant of the main app's global/directory bootstrap boundary.
import { reconcile } from "solid-js/store"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { refreshMessages, resetPendingEchoes } from "@/runtime/server/global-sync/session-cache-messages"
import { readSessionRecord, writeSessionRecord } from "@/runtime/persistence/storage-compact"
import { refreshModels } from "@/providers/models/store-compact"
import { refreshPermissions } from "@/session/requests/permission-sync-compact"
import { prompt, readPromptDraft } from "@/composer/persistence-singleton"
import { refreshQuestions } from "@/session/requests/question-sync-compact"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { createServerSdk, type OpencodeClient } from "@/runtime/server/client-compact"
import { idleStatus, setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { resolveServer, type ServerInfo } from "@/runtime/server/resolver-compact"
import { sessionDirectory } from "@/session/directory"
import { createDefaultSession, restoreSession } from "./session-load-current"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"

export function refreshCurrentMessages() {
  return refreshMessages(FETCH_MESSAGE_LIMIT)
}

export function refreshSessionStatus(activeClient: OpencodeClient, session: NonNullable<typeof state.session>) {
  return activeClient.session
    .active()
    .then((active) => {
      if (state.session?.id !== session.id) return
      setState("sessionStatus", active[session.id] ? { type: "busy" } : idleStatus)
    })
    .catch(() => {
      if (state.session?.id === session.id) setState("sessionStatus", idleStatus)
    })
}

export function activateSession(
  server: ServerInfo,
  session: NonNullable<typeof state.session>,
  options: { restoreDraft?: boolean } = {},
) {
  const draft = options.restoreDraft ? readPromptDraft() : undefined
  writeSessionRecord(session)
  const activeClient = createDirectorySdk(server, sessionDirectory(session)).client
  setSessionClient(activeClient)
  setState("session", session)
  setState("sessionStatus", idleStatus)
  setState("sessionMessages", [])
  resetPendingEchoes()
  setState("permission", reconcile({}))
  setState("permissionResponding", undefined)
  setState("form", reconcile({}))
  setState("questionResponding", undefined)
  prompt.restore(draft)
  setState("submitting", false)
  return Promise.all([
    refreshSessionStatus(activeClient, session).then(() => {
      if (state.session?.id === session.id) setState("status", "ready")
    }),
    refreshCurrentMessages(),
    refreshModels(activeClient, session),
    refreshPermissions(),
    refreshQuestions(),
    refreshRecentSessions(),
  ]).then(() => undefined)
}

export function initializeSessionSync() {
  setState("status", "loading")
  setState("modelStatus", "loading")
  return resolveServer().then((server) => {
    setState("server", server)
    const baseClient = createServerSdk(server).client
    return restoreSession(baseClient, readSessionRecord())
      .then((session) => session ?? createDefaultSession(baseClient, server.localAgent))
      .then((session) => activateSession(server, session, { restoreDraft: true }))
  })
}
