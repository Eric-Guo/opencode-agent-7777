// Single-session bootstrap variant of the main app's global/directory bootstrap boundary.
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { refreshMessages } from "@/context/global-sync/session-cache-messages"
import { readSessionRecord, writeSessionRecord } from "@/context/local-storage"
import { refreshModels } from "@/context/models-store"
import { refreshPermissions } from "@/context/permission-sync"
import { clearPromptDraft, readPromptDraft } from "@/context/prompt-state-storage"
import { refreshQuestions } from "@/context/question"
import { createDirectorySdk } from "@/context/sdk-directory-client"
import { createServerSdk, type OpencodeClient } from "@/context/server-sdk-client"
import { idleStatus, setSessionClient, setState, state } from "@/context/server-session-store"
import { resolveServer, type ServerInfo } from "@/context/server-resolver"
import { sessionDirectory } from "@/context/session-directory"
import { createDefaultSession, restoreSession } from "./session-load-current"
import { refreshRecentSessions } from "@/context/directory-sync-recent-sessions"

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
  if (!options.restoreDraft) clearPromptDraft()
  writeSessionRecord(session)
  const activeClient = createDirectorySdk(server, sessionDirectory(session)).client
  setSessionClient(activeClient)
  setState("session", session)
  setState("sessionStatus", idleStatus)
  setState("messages", [])
  setState("permissionRequest", undefined)
  setState("permissionResponding", false)
  setState("questionRequest", undefined)
  setState("questionResponding", false)
  setState("prompt", draft?.prompt ?? "")
  setState("attachments", draft?.attachments ?? [])
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
