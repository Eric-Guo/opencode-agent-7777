import { RECENT_SESSION_LIMIT } from "@/constants/session"
import { createDirectorySdk } from "@/context/sdk-directory-client"
import { setState, state } from "@/context/server-session-store"
import { normalizeSessionDirectory, sessionDirectory, type Session } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"

// Recent-session loading only; 7777 does not expose the main app's directory sync context.

export const DEFAULT_RECENT_SESSION_TITLE = "7777"

export function sessionUpdatedTime(session: Session) {
  return session.time.updated ?? session.time.created
}

export function refreshRecentSessions() {
  const server = state.server
  const directory = state.session ? sessionDirectory(state.session) : undefined
  if (!server || !directory) {
    setState("recentSessions", [])
    return Promise.resolve()
  }

  const client = createDirectorySdk(server, directory).client
  setState("recentSessionsLoading", true)
  return client.session
    .list({
      directory: normalizeSessionDirectory(directory),
      limit: RECENT_SESSION_LIMIT + 1,
      order: "desc",
    })
    .then((result) => {
      if (!state.session || sessionDirectory(state.session) !== directory) return
      setState(
        "recentSessions",
        result.data.filter((session) => session.id !== state.session?.id).slice(0, RECENT_SESSION_LIMIT),
      )
    })
    .catch((error) => setState("error", readableError(error)))
    .finally(() => setState("recentSessionsLoading", false))
}
