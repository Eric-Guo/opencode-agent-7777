import { translateSync } from "@/runtime/i18n/language"
import type { SessionRecord } from "@/runtime/persistence/storage-compact"
// Resolves the draft location or restores the current session. Only submission creates a session.
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { defaultSessionDirectory } from "@/session/directory"
import type { SessionInfo as Session } from "@opencode/client/promise"

export function restoreSession(baseClient: OpencodeClient, record: SessionRecord | undefined, signal?: AbortSignal) {
  if (!record) return Promise.resolve<Session | undefined>(undefined)
  return baseClient.session.get({ sessionID: record.id }, { signal }).catch(() => undefined)
}

export function createSession(baseClient: OpencodeClient, directory: string, localAgent: string, signal?: AbortSignal) {
  return baseClient.session
    .create(
      {
        agent: localAgent,
        location: { directory },
      },
      { signal },
    )
    .catch((error) => {
      throw error ?? new Error(translateSync("error.createSessionFailed", { agent: localAgent }))
    })
}

export function loadDefaultSessionDirectory(baseClient: OpencodeClient, signal?: AbortSignal) {
  return baseClient.location.get(undefined, { signal }).then((location) => {
    if (typeof location.directory !== "string") throw new Error(translateSync("error.loadServerPathFailed"))
    return defaultSessionDirectory(location.directory)
  })
}
