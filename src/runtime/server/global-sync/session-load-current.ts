import { translateSync } from "@/runtime/i18n/language"
import type { SessionRecord } from "@/runtime/persistence/storage-compact"
// Creates or restores the current 7777 session rather than paging a directory session list.
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { defaultSessionDirectory } from "@/session/directory"
import type { SessionInfo as Session } from "@opencode/client/promise"

export function restoreSession(baseClient: OpencodeClient, record: SessionRecord | undefined) {
  if (!record) return Promise.resolve<Session | undefined>(undefined)
  return baseClient.session
    .get({ sessionID: record.id })
    .then((session) => {
      // Earlier meeting bundles used 7777's default folder; keep those sessions but start in this branch's folder.
      if (session.location.directory.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) === "agent7777") return
      return session
    })
    .catch(() => undefined)
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

export function createDefaultSession(baseClient: OpencodeClient, localAgent: string) {
  return baseClient.location.get().then((location) => {
    if (typeof location.directory !== "string") throw new Error(translateSync("error.loadServerPathFailed"))
    return createSession(baseClient, defaultSessionDirectory(location.directory), localAgent)
  })
}
