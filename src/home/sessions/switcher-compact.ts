import { sameDirectory } from "@opencode/util/path"
import { bounded } from "@/runtime/server/operation"
import { createLoadState, transitionLoad, type LoadState } from "@/runtime/server/load-machine"
import { recoverDeletedSession } from "@/session/recovery-compact"
import type { SessionInfo as Session } from "@opencode/client/promise"
import { createServerSdk } from "@/runtime/server/client-compact"
import { sessionTreeIDs } from "@/session/requests/session-request-tree"
import { refreshRecentSessions } from "./directory-sync-recent-compact"
import { compareSessionTime } from "./records"
import { currentDirectory, currentDraft, currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { activateDraft } from "@/runtime/server/global-sync/bootstrap-session"
import { activateSession, restartSessionEventStream } from "@/runtime/server/sync-session-compact"
import { readableError } from "@/shell/errors/readable"
import { isSessionNotFoundError } from "@/runtime/server/errors"

// Header-driven session switching only; 7777 has no tab router or tabs context.

const switches = new WeakMap<object, LoadState>()

export function openRecentSession(session: Session) {
  const server = state.server
  if (!server) return Promise.resolve()
  const original = currentRuntime() ?? currentDraft() ?? server
  if (switches.get(original)?.status === "loading") return Promise.resolve()
  let machine = transitionLoad(switches.get(original) ?? createLoadState(), { type: "started" })
  const attempt = machine.attempt
  switches.set(original, machine)
  const baseClient = createServerSdk(server).client
  setState("error", "")
  setState("recentSessionSwitchingID", session.id)
  let activation = currentRuntime() ?? currentDraft()
  const current = () => (currentRuntime() ?? currentDraft()) === activation
  const activate = (session: Session) => {
    const loading = activateSession(server, session)
    activation = currentRuntime()
    if (activation) switches.set(activation, machine)
    return loading.then(() => {
      if (current()) restartSessionEventStream()
    })
  }
  return activate(session)
    .catch((error) => {
      if (!current()) return
      if (!isSessionNotFoundError(error, session.id)) {
        machine = transitionLoad(machine, { type: "failed", attempt, error })
        setState("error", readableError(error))
        return
      }
      return bounded((signal) => recoverDeletedSession(baseClient, session, signal), { signal: activation?.signal })
        .then((result) => {
          if (!current()) return
          const loading = result.session ? activate(result.session) : activateDraft(server, result.directory)
          activation = currentRuntime() ?? currentDraft()
          if (activation) switches.set(activation, machine)
          return loading.then(() => {
            if (current()) setState("error", result.message)
          })
        })
        .catch((recoveryError) => {
          machine = transitionLoad(machine, { type: "failed", attempt, error: recoveryError })
          if (current()) setState("error", readableError(recoveryError))
        })
    })
    .finally(() => {
      machine = transitionLoad(machine, { type: "succeeded", attempt })
      switches.set(original, machine)
      if (activation) switches.set(activation, machine)
      if (current()) setState("recentSessionSwitchingID", machine.status === "loading" ? session.id : undefined)
    })
}

// Both the HTTP acknowledgement and session.deleted can arrive first.
export function sessionRemoved(id: string) {
  const server = state.server
  const active = state.session
  const directory = currentDirectory()
  if (!server || !directory) return
  const recent = state.recentSessions.filter((s) => sameDirectory(s.location.directory, directory))
  const records = active ? [...recent, active] : recent
  const removed = new Set(sessionTreeIDs(records, id))
  const remaining = recent.filter((s) => !removed.has(s.id))
  if (remaining.length !== recent.length) setState("recentSessions", remaining)
  currentRuntime()?.requestAncestry.removed(id)
  if (!active || !removed.has(active.id)) {
    if (remaining.length !== recent.length || state.recentSessionsLoading) void refreshRecentSessions()
    return
  }
  const roots = records.filter((s) => !s.parentID && !s.time.archived).sort(compareSessionTime)
  const index = roots.findIndex((s) => s.id === id)
  const next =
    remaining.find((s) => s.id === active.parentID) ??
    roots.slice(index + 1).find((s) => !removed.has(s.id)) ??
    roots.slice(0, index).findLast((s) => !removed.has(s.id))
  if (next && !state.recentSessionSwitchingID) {
    void openRecentSession(next)
    return
  }
  void activateDraft(server, directory).catch(() => {}) // Activation owns its Retry banner.
}
