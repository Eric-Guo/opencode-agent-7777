import { recoverDeletedSession } from "@/session/recovery-compact"
import type { SessionInfo as Session } from "@opencode-ai/client/promise"
import { createServerSdk } from "@/runtime/server/client-compact"
import { setState, state } from "@/runtime/server/session-store-compact"
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
