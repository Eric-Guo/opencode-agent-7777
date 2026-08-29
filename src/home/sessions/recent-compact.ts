import { sessionUpdatedTime } from "@/home/sessions/directory-sync-recent-compact"
import { currentLocalAgent } from "@/runtime/server/session-store-compact"
import type { SessionInfo as Session } from "@opencode-ai/client/promise"
import { sessionTitle } from "@/session/title"

// Presentation helpers for the header history menu; 7777 has no home route.

export function recentSessionTitle(session: Session) {
  return sessionTitle(session.title?.trim()) || currentLocalAgent()
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
