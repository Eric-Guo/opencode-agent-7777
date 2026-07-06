import type { Session } from "@opencode-ai/sdk"
import { refreshRecentSessions } from "@/context/directory-sync"
import { setState, state } from "@/context/server-session"
import { activateSession, restartSessionEventStream } from "@/context/server-sync"
import { readableError } from "@/utils/server-errors"

export function openRecentSession(session: Session) {
  const server = state.server
  if (!server || state.recentSessionSwitchingID) return Promise.resolve()
  setState("error", "")
  setState("recentSessionSwitchingID", session.id)
  return activateSession(server, session)
    .then(restartSessionEventStream)
    .then(refreshRecentSessions)
    .catch((error) => setState("error", readableError(error)))
    .finally(() => setState("recentSessionSwitchingID", undefined))
}
