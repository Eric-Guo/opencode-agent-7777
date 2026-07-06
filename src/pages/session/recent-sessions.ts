import type { Session } from "@opencode-ai/sdk"
import { RECENT_SESSION_LIMIT } from "@/constants/session"
import { makeClient } from "@/context/sdk"
import { setState, state } from "@/context/server-session"
import { normalizeSessionDirectory } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"

function sessionTime(session: Session) {
  return session.time.updated ?? session.time.created
}

function sortRecentSessions(sessions: Session[]) {
  return [...sessions].sort((a, b) => {
    const diff = sessionTime(b) - sessionTime(a)
    if (diff !== 0) return diff
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })
}

function uniqueSessions(sessions: Session[]) {
  return [...new Map(sessions.filter((session) => !!session.id).map((session) => [session.id, session])).values()]
}

function rootSessions(sessions: Session[]) {
  return sessions.filter((session) => !session.parentID)
}

export function recentSessionTitle(session: Session) {
  return session.title.trim() || "7777"
}

export function recentSessionDescription(session: Session) {
  const date = new Date(sessionTime(session))
  if (Number.isNaN(date.getTime())) return session.id
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function refreshRecentSessions() {
  const server = state.server
  const directory = state.session?.directory
  if (!server || !directory) {
    setState("recentSessions", [])
    return Promise.resolve()
  }

  const client = makeClient(server, directory)
  setState("recentSessionsLoading", true)
  return client.session
    .list({
      query: { directory: normalizeSessionDirectory(directory) },
    })
    .then((result) => {
      if (state.session?.directory !== directory) return
      setState(
        "recentSessions",
        sortRecentSessions(rootSessions(uniqueSessions(result.data ?? [])))
          .filter((session) => session.id !== state.session?.id)
          .slice(0, RECENT_SESSION_LIMIT),
      )
    })
    .catch((error) => setState("error", readableError(error)))
    .finally(() => setState("recentSessionsLoading", false))
}
