import { translateSync } from "@/runtime/i18n/language"
import { loadDefaultSessionDirectory } from "@/runtime/server/global-sync/session-load-current"
import type { SessionInfo as Session } from "@opencode/client/promise"
import type { OpencodeClient } from "@/runtime/server/client-compact"

export async function recoverDeletedSession(baseClient: OpencodeClient, session: Session) {
  const parent = await loadParentSession(baseClient, session)
  if (parent)
    return { session: parent, directory: parent.location.directory, message: translateSync("session.recovered.parent") }
  return {
    session: undefined,
    directory: await loadDefaultSessionDirectory(baseClient),
    message: translateSync("session.recovered.new"),
  }
}

function loadParentSession(baseClient: OpencodeClient, session: Session) {
  if (!session.parentID) return Promise.resolve<Session | undefined>(undefined)
  return baseClient.session.get({ sessionID: session.parentID }).catch(() => undefined)
}
