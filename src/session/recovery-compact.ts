import { translateSync } from "@/runtime/i18n/language"
import { createDefaultSession } from "@/runtime/server/global-sync/session-load-current"
import type { SessionInfo as Session } from "@opencode-ai/client/promise"
import type { OpencodeClient } from "@/runtime/server/client-compact"

export async function recoverDeletedSession(baseClient: OpencodeClient, session: Session, localAgent: string) {
  const parent = await loadParentSession(baseClient, session)
  if (parent) return { session: parent, message: translateSync("session.recovered.parent") }
  return {
    session: await createDefaultSession(baseClient, localAgent),
    message: translateSync("session.recovered.new"),
  }
}

function loadParentSession(baseClient: OpencodeClient, session: Session) {
  if (!session.parentID) return Promise.resolve<Session | undefined>(undefined)
  return baseClient.session.get({ sessionID: session.parentID }).catch(() => undefined)
}
