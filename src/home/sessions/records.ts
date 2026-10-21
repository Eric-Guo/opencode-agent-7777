import type { SessionInfo } from "@opencode/client/promise"
import { sessionTitle } from "@/session/title"

export type HomeSessionGroup = {
  id: "today" | "yesterday" | "older"
  sessions: SessionInfo[]
}

export function sessionUpdatedTime(session: SessionInfo) {
  return session.time.updated ?? session.time.created
}

export function compareSessionTime(a: SessionInfo, b: SessionInfo) {
  return sessionUpdatedTime(b) - sessionUpdatedTime(a) || b.id.localeCompare(a.id)
}

// Use calendar dates, rather than 24-hour offsets, across daylight-saving changes.
function localDay(date: Date) {
  return date.getFullYear() * 10_000 + date.getMonth() * 100 + date.getDate()
}

export function groupSessions(sessions: SessionInfo[], now = new Date()): HomeSessionGroup[] {
  const today = localDay(now)
  const yesterday = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const groups: HomeSessionGroup[] = [
    { id: "today", sessions: [] },
    { id: "yesterday", sessions: [] },
    { id: "older", sessions: [] },
  ]
  for (const session of sessions) {
    const day = localDay(new Date(sessionUpdatedTime(session)))
    groups[day === today ? 0 : day === yesterday ? 1 : 2].sessions.push(session)
  }
  return groups.filter((group) => group.sessions.length > 0)
}

// The compact header supplies its active agent as the fallback for untitled sessions.
export function recentSessionTitle(session: SessionInfo, fallback: string) {
  return sessionTitle(session.title?.trim()) || fallback
}

export function recentSessionDescription(session: SessionInfo, locale?: string) {
  const date = new Date(sessionUpdatedTime(session))
  if (Number.isNaN(date.getTime())) return session.id
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
