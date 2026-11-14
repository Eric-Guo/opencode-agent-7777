import { bounded } from "@/runtime/server/operation"
import { createLoadState, transitionLoad, type LoadState } from "@/runtime/server/load-machine"
import { recoverDeletedSession } from "@/session/recovery-compact"
import type { SessionInfo as Session } from "@opencode/client/promise"
import { createServerSdk } from "@/runtime/server/client-compact"
import { currentDraft, currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
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
