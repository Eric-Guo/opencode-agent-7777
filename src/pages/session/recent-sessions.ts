import type { Part, Session } from "@opencode-ai/sdk"
import { RECENT_SESSION_LIMIT } from "@/constants/session"
import { makeClient } from "@/context/sdk"
import { setState, state, type HistoryItem } from "@/context/server-session"
import { normalizeSessionDirectory } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"

const HIDDEN_BLANK_RECENT_SESSION_IDS_KEY = "opencode.7777.recent.hiddenBlankSessionIDs"
const HIDDEN_BLANK_RECENT_SESSION_LIMIT = 100
const DEFAULT_RECENT_SESSION_TITLE = "7777"
const hiddenBlankRecentSessionIDs = new Set<string>()

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

function isMeaningfulUserPart(part: Part) {
  if (part.type === "compaction" || part.type === "step-start" || part.type === "step-finish") return false
  if (part.type === "text") return !part.synthetic && part.text.trim().length > 0
  if (part.type === "subtask") return part.prompt.trim().length > 0
  return true
}

export function isDefaultRecentSessionTitle(title: string) {
  return !title.trim() || title.trim() === DEFAULT_RECENT_SESSION_TITLE
}

export function sessionHasUserContent(messages: HistoryItem[]) {
  return messages.some(
    (message) => message.info.role === "user" && message.parts.some((part) => isMeaningfulUserPart(part)),
  )
}

function readHiddenBlankRecentSessionIDs() {
  const ids = new Set(hiddenBlankRecentSessionIDs)
  if (typeof localStorage !== "object") return ids
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_BLANK_RECENT_SESSION_IDS_KEY) || "[]") as unknown
    if (!Array.isArray(parsed)) return ids
    for (const id of parsed) {
      if (typeof id === "string") ids.add(id)
    }
    return ids
  } catch {
    return ids
  }
}

function writeHiddenBlankRecentSessionIDs(ids: Set<string>) {
  hiddenBlankRecentSessionIDs.clear()
  for (const id of [...ids].slice(-HIDDEN_BLANK_RECENT_SESSION_LIMIT)) {
    hiddenBlankRecentSessionIDs.add(id)
  }
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(
      HIDDEN_BLANK_RECENT_SESSION_IDS_KEY,
      JSON.stringify([...hiddenBlankRecentSessionIDs]),
    )
  } catch {
    return
  }
}

export function hideBlankRecentSession(sessionID: string) {
  const ids = readHiddenBlankRecentSessionIDs()
  ids.add(sessionID)
  writeHiddenBlankRecentSessionIDs(ids)
  setState("recentSessions", (sessions) => sessions.filter((session) => session.id !== sessionID))
}

export function recentSessionTitle(session: Session) {
  return session.title.trim() || DEFAULT_RECENT_SESSION_TITLE
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
      const hiddenSessionIDs = readHiddenBlankRecentSessionIDs()
      setState(
        "recentSessions",
        sortRecentSessions(rootSessions(uniqueSessions(result.data ?? [])))
          .filter((session) => session.id !== state.session?.id)
          .filter((session) => !hiddenSessionIDs.has(session.id))
          .slice(0, RECENT_SESSION_LIMIT),
      )
    })
    .catch((error) => setState("error", readableError(error)))
    .finally(() => setState("recentSessionsLoading", false))
}
