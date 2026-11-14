// Single-session bootstrap variant of the main app's global/directory bootstrap boundary.
import { bounded } from "../operation"
import { createLoadState, transitionLoad, type LoadState } from "../load-machine"
import { clearReadError, reportReadError } from "../read-errors"
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
  return bounded((signal) => activeClient.session.active({ signal }), { signal: runtime?.signal })
    .then((active) => {
      if (!current()) return
      setSessionStatus(active[session.id] ? { type: "busy" } : idleStatus)
    })
    .catch(() => {
      if (current()) setSessionStatus(idleStatus)
    })
}

const activationStates = new WeakMap<object, LoadState>()
const activationRetries = new WeakMap<object, () => Promise<void>>()
export function retrySessionActivation() {
  const owner = currentRuntime() ?? currentDraft()
  return owner ? (activationRetries.get(owner)?.() ?? Promise.resolve()) : Promise.resolve()
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
  const owner = runtime!
  const hydrate = () => {
    activationStates.set(owner, transitionLoad(activationStates.get(owner) ?? createLoadState(), { type: "started" }))
    const attempt = activationStates.get(owner)!.attempt
    clearReadError(owner)
    return bounded(
      () =>
        Promise.all([
          refreshSessionStatus(activeClient, session).then(() => {
            if (
              currentRuntime() === runtime &&
              activationStates.get(owner)?.status === "loading" &&
              activationStates.get(owner)?.attempt === attempt
            )
              setState("status", "ready")
          }),
          runtime?.refreshMessages(FETCH_MESSAGE_LIMIT),
          refreshModels(activeClient, session),
          refreshPermissions(),
          refreshForms(),
          refreshRecentSessions(),
        ]),
      { signal: owner.signal },
    )
      .then(() => {
        const machine = activationStates.get(owner)!
        if (machine.attempt === attempt)
          activationStates.set(owner, transitionLoad(machine, { type: "succeeded", attempt }))
      })
      .catch((error) => {
        if (
          currentRuntime() === owner &&
          !owner.signal.aborted &&
          activationStates.get(owner)?.status === "loading" &&
          activationStates.get(owner)?.attempt === attempt
        ) {
          activationStates.set(owner, transitionLoad(activationStates.get(owner)!, { type: "failed", attempt, error }))
          reportReadError(owner, error, () => {
            void hydrate().catch(() => {})
          })
        }
        throw error
      })
  }
  owner.signal.addEventListener("abort", () => clearReadError(owner), { once: true })
  activationRetries.set(owner, hydrate)
  return hydrate()
}

export function activateDraft(server: ServerInfo, directory: string, options: { restoreDraft?: boolean } = {}) {
  const saved = options.restoreDraft ? readPromptDraft(server.storageKeys?.promptDraft) : undefined
  writeSessionDraft(directory, server.storageKeys)
  setSessionDraft(createDirectorySdk(server, directory).client, directory)
  const draft = currentDraft()
  prompt.restore(saved)
  setState("status", "ready")
  const owner = draft!
  const hydrate = () => {
    clearReadError(owner)
    return bounded(() => Promise.all([refreshModels(owner.api, undefined), refreshRecentSessions()]), {
      signal: owner.signal,
    })
      .then(() => undefined)
      .catch((error) => {
        if (currentDraft() === owner && !owner.signal.aborted)
          reportReadError(owner, error, () => {
            void hydrate().catch(() => {})
          })
        throw error
      })
  }
  activationRetries.set(owner, hydrate)
  owner.signal.addEventListener("abort", () => clearReadError(owner), { once: true })
  return hydrate()
}

export function initializeSessionSync(
  current = () => true,
  signal?: AbortSignal,
  attached: (signal: AbortSignal) => void = () => {},
) {
  setState("status", "loading")
  setState("modelStatus", "loading")
  return resolveServer().then((server) => {
    if (!current()) return
    setState("server", server)
    const baseClient = createServerSdk(server).client
    return restoreSession(baseClient, readSessionRecord(server.storageKeys), signal).then(async (session) => {
      if (!current()) return
      if (session) {
        const loading = activateSession(server, session, { restoreDraft: true })
        attached(currentRuntime()!.signal)
        return loading
      }
      const directory =
        readSessionDirectory(server.storageKeys) ?? (await loadDefaultSessionDirectory(baseClient, signal))
      if (current()) {
        const loading = activateDraft(server, directory, { restoreDraft: true })
        attached(currentDraft()!.signal)
        return loading
      }
    })
  })
}
