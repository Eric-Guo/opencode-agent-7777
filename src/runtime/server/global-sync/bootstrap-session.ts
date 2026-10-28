// Single-session bootstrap variant of the main app's global/directory bootstrap boundary.
import { reconcile } from "solid-js/store"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import {
  readSessionDirectory,
  readSessionRecord,
  writeSessionDraft,
  writeSessionRecord,
} from "@/runtime/persistence/storage-compact"
import { refreshModels } from "@/providers/catalog/loader-compact"
import { refreshPermissions } from "@/session/requests/permission-sync-compact"
import { prompt, readPromptDraft } from "@/composer/persistence-singleton"
import { refreshForms } from "@/session/requests/form-sync-compact"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { createServerSdk, type OpencodeClient } from "@/runtime/server/client-compact"
import {
  idleStatus,
  currentRuntime,
  currentDraft,
  setSessionStatus,
  setSessionClient,
  setSessionDraft,
  setState,
  state,
} from "@/runtime/server/session-store-compact"
import { resolveServer, type ServerInfo } from "@/runtime/server/resolver-compact"
import { sessionDirectory } from "@/session/directory"
import { loadDefaultSessionDirectory, restoreSession } from "./session-load-current"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"

export function refreshSessionStatus(activeClient: OpencodeClient, session: NonNullable<typeof state.session>) {
  const runtime = currentRuntime()
  const revision = runtime?.statusRevision()
  const current = () =>
    currentRuntime() === runtime && runtime?.statusRevision() === revision && state.session?.id === session.id
  return activeClient.session
    .active()
    .then((active) => {
      if (!current()) return
      setSessionStatus(active[session.id] ? { type: "busy" } : idleStatus)
    })
    .catch(() => {
      if (current()) setSessionStatus(idleStatus)
    })
}

export function activateSession(
  server: ServerInfo,
  session: NonNullable<typeof state.session>,
  options: { restoreDraft?: boolean; created?: boolean } = {},
) {
  const draft = options.restoreDraft ? readPromptDraft(server.storageKeys?.promptDraft) : undefined
  writeSessionRecord(session, server.storageKeys)
  const activeClient = createDirectorySdk(server, sessionDirectory(session)).client
  setState("session", undefined)
  setSessionClient(activeClient, session)
  const runtime = currentRuntime()
  setState("permission", reconcile({}))
  setState("permissionResponding", undefined)
  setState("form", reconcile({}))
  setState("questionResponding", undefined)
  if (options.created) {
    setState("status", "ready")
    if (state.modelStatus !== "ready") void refreshModels(activeClient, session)
    return Promise.resolve()
  }
  prompt.restore(draft)
  setState("submitting", false)
  return Promise.all([
    refreshSessionStatus(activeClient, session).then(() => {
      if (currentRuntime() === runtime) setState("status", "ready")
    }),
    runtime?.refreshMessages(FETCH_MESSAGE_LIMIT),
    refreshModels(activeClient, session),
    refreshPermissions(),
    refreshForms(),
    refreshRecentSessions(),
  ]).then(() => undefined)
}

export function activateDraft(server: ServerInfo, directory: string, options: { restoreDraft?: boolean } = {}) {
  const saved = options.restoreDraft ? readPromptDraft(server.storageKeys?.promptDraft) : undefined
  writeSessionDraft(directory, server.storageKeys)
  setSessionDraft(createDirectorySdk(server, directory).client, directory)
  const draft = currentDraft()
  prompt.restore(saved)
  setState("status", "ready")
  return Promise.all([refreshModels(draft?.api, undefined), refreshRecentSessions()]).then(() => undefined)
}

export function initializeSessionSync(current = () => true) {
  setState("status", "loading")
  setState("modelStatus", "loading")
  return resolveServer().then((server) => {
    if (!current()) return
    setState("server", server)
    const baseClient = createServerSdk(server).client
    return restoreSession(baseClient, readSessionRecord(server.storageKeys)).then(async (session) => {
      if (!current()) return
      if (session) return activateSession(server, session, { restoreDraft: true })
      const directory = readSessionDirectory(server.storageKeys) ?? (await loadDefaultSessionDirectory(baseClient))
      if (current()) return activateDraft(server, directory, { restoreDraft: true })
    })
  })
}
