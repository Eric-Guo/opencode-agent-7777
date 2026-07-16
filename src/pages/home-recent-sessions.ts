import { sessionUpdatedTime } from "@/context/directory-sync-recent-sessions"
import { currentLocalAgent } from "@/context/server-session-store"
import type { Session } from "@/context/session-directory"

// Presentation helpers for the header history menu; 7777 has no home route.

export function recentSessionTitle(session: Session) {
  return session.title.trim() || currentLocalAgent()
}

export function recentSessionDescription(session: Session) {
  const date = new Date(sessionUpdatedTime(session))
  if (Number.isNaN(date.getTime())) return session.id
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
