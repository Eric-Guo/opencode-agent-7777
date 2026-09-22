import { sessionUpdatedTime } from "@/home/sessions/directory-sync-recent-compact"
import { currentLocalAgent } from "@/runtime/server/session-store-compact"
import type { SessionInfo as Session } from "@opencode/client/promise"
import { sessionTitle } from "@/session/title"

// Presentation helpers for the header's recent-session region; 7777 has no home route.

export function recentSessionTitle(session: Session) {
  return sessionTitle(session.title?.trim()) || currentLocalAgent()
}

export function recentSessionDescription(session: Session, locale?: string) {
  const date = new Date(sessionUpdatedTime(session))
  if (Number.isNaN(date.getTime())) return session.id
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
