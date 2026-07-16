import { recoverDeletedSession } from "@/context/session-recovery"
import type { Session } from "@/context/session-directory"
import { createServerSdk } from "@/context/server-sdk"
import { setState, state } from "@/context/server-session"
import { activateSession, restartSessionEventStream } from "@/context/server-sync"
import { isSessionNotFoundError, readableError } from "@/utils/server-errors"

export function openRecentSession(session: Session) {
  const server = state.server
  if (!server || state.recentSessionSwitchingID) return Promise.resolve()
  const baseClient = createServerSdk(server).client
  setState("error", "")
  setState("recentSessionSwitchingID", session.id)
  return activateSession(server, session)
    .then(restartSessionEventStream)
    .catch((error) => {
      if (!isSessionNotFoundError(error, session.id)) {
        setState("error", readableError(error))
        return
      }
      return recoverDeletedSession(baseClient, session, server.localAgent)
        .then((result) =>
          activateSession(server, result.session)
            .then(restartSessionEventStream)
            .then(() => {
              setState("error", result.message)
            }),
        )
        .catch((recoveryError) => setState("error", readableError(recoveryError)))
    })
    .finally(() => setState("recentSessionSwitchingID", undefined))
}
