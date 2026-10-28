import { translateSync } from "@/runtime/i18n/language"
import type { SessionRecord } from "@/runtime/persistence/storage-compact"
// Resolves the draft location or restores the current session. Only submission creates a session.
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { defaultSessionDirectory } from "@/session/directory"
import type { SessionInfo as Session } from "@opencode/client/promise"

export function restoreSession(baseClient: OpencodeClient, record: SessionRecord | undefined) {
  if (!record) return Promise.resolve<Session | undefined>(undefined)
  return baseClient.session.get({ sessionID: record.id }).catch(() => undefined)
}

export function createSession(baseClient: OpencodeClient, directory: string, localAgent: string) {
  return baseClient.session
    .create({
      agent: localAgent,
      location: { directory },
    })
    .catch((error) => {
      throw error ?? new Error(translateSync("error.createSessionFailed", { agent: localAgent }))
    })
}

export function loadDefaultSessionDirectory(baseClient: OpencodeClient) {
  return baseClient.location.get().then((location) => {
    if (typeof location.directory !== "string") throw new Error(translateSync("error.loadServerPathFailed"))
    return defaultSessionDirectory(location.directory)
  })
}
