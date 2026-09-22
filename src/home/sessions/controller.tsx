import type { SessionInfo } from "@opencode/client/promise"
import type { Accessor } from "solid-js"
import { sessionUpdatedTime } from "./directory-sync-recent-compact"

export type HomeSessionGroup = {
  id: "today" | "yesterday" | "older"
  sessions: SessionInfo[]
}

// Match Home's controller boundary, with one directory and a bounded recent list.
export function createHomeSessionsController(input: {
  sessions: Accessor<SessionInfo[]>
  loading: Accessor<boolean>
  switching: Accessor<boolean>
  open: (session: SessionInfo) => void
}) {
  return {
    data: {
      list: () =>
        input.sessions().toSorted((a, b) => sessionUpdatedTime(b) - sessionUpdatedTime(a) || a.id.localeCompare(b.id)),
      loading: input.loading,
    },
    session: {
      switching: input.switching,
      open(session: SessionInfo) {
        if (input.switching()) return false
        const current = input.sessions().find((item) => item.id === session.id)
        if (!current) return false
        input.open(current)
        return true
      },
    },
  }
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

export type HomeSessionsController = ReturnType<typeof createHomeSessionsController>
