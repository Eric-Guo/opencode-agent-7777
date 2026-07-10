import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { refreshMessages } from "@/context/global-sync/session-cache"
import { readSessionRecord, writeSessionRecord } from "@/context/local"
import { refreshModels } from "@/context/models"
import { refreshPermissions } from "@/context/permission"
import { clearPromptDraft, readPromptDraft } from "@/context/prompt"
import { refreshQuestions } from "@/context/question"
import { createDirectorySdk } from "@/context/sdk"
import { createServerSdk, type OpencodeClient } from "@/context/server-sdk"
import { idleStatus, setSessionClient, setState, state } from "@/context/server-session"
import { resolveServer, type ServerInfo } from "@/context/server"
import { normalizeSessionDirectory } from "@/context/session-directory"
import { createDefaultSession, restoreSession } from "./session-load"
import { refreshRecentSessions } from "@/context/directory-sync"

export function refreshCurrentMessages() {
  return refreshMessages(FETCH_MESSAGE_LIMIT)
}

export function refreshSessionStatus(activeClient: OpencodeClient, session: NonNullable<typeof state.session>) {
  return activeClient.session
    .status({
      query: { directory: normalizeSessionDirectory(session.directory) },
    })
    .then((result) => {
      if (state.session?.id !== session.id) return
      setState("sessionStatus", result.data?.[session.id] ?? idleStatus)
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
  const activeClient = createDirectorySdk(server, session.directory).client
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
      .then((session) => session ?? createDefaultSession(baseClient))
      .then((session) => activateSession(server, session, { restoreDraft: true }))
  })
}
