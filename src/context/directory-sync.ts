import type { Session } from "@opencode-ai/sdk"
import { RECENT_SESSION_LIMIT } from "@/constants/session"
import { createDirectorySdk } from "@/context/sdk"
import { setState, state } from "@/context/server-session"
import { normalizeSessionDirectory } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"

export const DEFAULT_RECENT_SESSION_TITLE = "7777"

export function sessionUpdatedTime(session: Session) {
  return session.time.updated ?? session.time.created
}

export function refreshRecentSessions() {
  const server = state.server
  const directory = state.session?.directory
  if (!server || !directory) {
    setState("recentSessions", [])
    return Promise.resolve()
  }

  const client = createDirectorySdk(server, directory).client
  setState("recentSessionsLoading", true)
  return client.session
    .list({
      query: { directory: normalizeSessionDirectory(directory) },
    })
    .then((result) => {
      if (state.session?.directory !== directory) return
      setState("recentSessions", (result.data ?? []).slice(0, RECENT_SESSION_LIMIT))
    })
    .catch((error) => setState("error", readableError(error)))
    .finally(() => setState("recentSessionsLoading", false))
}
