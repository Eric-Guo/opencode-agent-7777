import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { clearPromptDraft, readPromptDraft, readSessionRecord, writeSessionRecord } from "@/context/local"
import { refreshModels } from "@/context/models"
import { refreshPermissions } from "@/context/permission"
import { makeClient } from "@/context/sdk"
import {
  idleStatus,
  refreshMessages,
  setSessionClient,
  setState,
  state,
} from "@/context/server-session"
import { resolveServer, type ServerInfo } from "@/context/server"
import { createDefaultSession, restoreSession } from "./session-load"
import { refreshRecentSessions } from "@/pages/session/recent-sessions"

export function refreshCurrentMessages() {
  return refreshMessages(FETCH_MESSAGE_LIMIT)
}

export function activateSession(
  server: ServerInfo,
  session: NonNullable<typeof state.session>,
  options: { restoreDraft?: boolean } = {},
) {
  const draft = options.restoreDraft ? readPromptDraft() : undefined
  if (!options.restoreDraft) clearPromptDraft()
  writeSessionRecord(session)
  const activeClient = makeClient(server, session.directory)
  setSessionClient(activeClient)
  setState("session", session)
  setState("sessionStatus", idleStatus)
  setState("messages", [])
  setState("permissionRequest", undefined)
  setState("permissionResponding", false)
  setState("prompt", draft?.prompt ?? "")
  setState("attachments", draft?.attachments ?? [])
  setState("submitting", false)
  setState("status", "ready")
  return Promise.all([
    refreshCurrentMessages(),
    refreshModels(activeClient, session),
    refreshPermissions(),
    refreshRecentSessions(),
  ]).then(() => undefined)
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
        .then((session) => activateSession(server, session, { restoreDraft: true }))
    })
}
