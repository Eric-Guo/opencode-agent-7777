import { translateSync } from "@/context/language"
import { createDefaultSession } from "@/context/global-sync/session-load"
import type { Session } from "@/context/session-directory"
import type { OpencodeClient } from "@/context/server-sdk"

export async function recoverDeletedSession(baseClient: OpencodeClient, session: Session) {
  const parent = await loadParentSession(baseClient, session)
  if (parent) return { session: parent, message: translateSync("session.recovered.parent") }
  return {
    session: await createDefaultSession(baseClient),
    message: translateSync("session.recovered.new"),
  }
}

function loadParentSession(baseClient: OpencodeClient, session: Session) {
  if (!session.parentID) return Promise.resolve<Session | undefined>(undefined)
  return baseClient.session.get({ sessionID: session.parentID }).catch(() => undefined)
}
