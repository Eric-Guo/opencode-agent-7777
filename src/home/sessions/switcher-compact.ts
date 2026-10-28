import { recoverDeletedSession } from "@/session/recovery-compact"
import type { SessionInfo as Session } from "@opencode/client/promise"
import { createServerSdk } from "@/runtime/server/client-compact"
import { currentDraft, currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { activateDraft } from "@/runtime/server/global-sync/bootstrap-session"
import { activateSession, restartSessionEventStream } from "@/runtime/server/sync-session-compact"
import { readableError } from "@/shell/errors/readable"
import { isSessionNotFoundError } from "@/runtime/server/errors"

// Header-driven session switching only; 7777 has no tab router or tabs context.

export function openRecentSession(session: Session) {
  const server = state.server
  if (!server || state.recentSessionSwitchingID) return Promise.resolve()
  const baseClient = createServerSdk(server).client
  setState("error", "")
  setState("recentSessionSwitchingID", session.id)
  let activation = currentRuntime() ?? currentDraft()
  const current = () => (currentRuntime() ?? currentDraft()) === activation
  const activate = (session: Session) => {
    const loading = activateSession(server, session)
    activation = currentRuntime()
    return loading.then(() => {
      if (current()) restartSessionEventStream()
    })
  }
  return activate(session)
    .catch((error) => {
      if (!current()) return
      if (!isSessionNotFoundError(error, session.id)) {
        setState("error", readableError(error))
        return
      }
      return recoverDeletedSession(baseClient, session)
        .then((result) => {
          if (!current()) return
          const loading = result.session ? activate(result.session) : activateDraft(server, result.directory)
          activation = currentRuntime() ?? currentDraft()
          return loading.then(() => {
            if (current()) setState("error", result.message)
          })
        })
        .catch((recoveryError) => {
          if (current()) setState("error", readableError(recoveryError))
        })
    })
    .finally(() => {
      if (current()) setState("recentSessionSwitchingID", undefined)
    })
}
