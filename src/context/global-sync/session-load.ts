import { translateSync } from "@/context/language"
import type { SessionRecord } from "@/context/local"
import type { OpencodeClient } from "@/context/sdk"
import { defaultSessionDirectory, normalizeSessionDirectory, type Session } from "@/context/session-directory"

export function restoreSession(baseClient: OpencodeClient, record: SessionRecord | undefined) {
  if (!record) return Promise.resolve<Session | undefined>(undefined)
  return baseClient.session.get({ sessionID: record.id }).catch(() => undefined)
}

export function createSession(baseClient: OpencodeClient, directory: string, localAgent: string) {
  return baseClient.session
    .create({
      agent: localAgent,
      location: { directory: normalizeSessionDirectory(directory) },
    })
    .catch((error) => {
      throw error ?? new Error(translateSync("error.createSessionFailed"))
    })
}

export function createDefaultSession(baseClient: OpencodeClient, localAgent: string) {
  return baseClient.location.get().then((location) => {
    if (typeof location.directory !== "string") throw new Error(translateSync("error.loadServerPathFailed"))
    return createSession(baseClient, defaultSessionDirectory(location.directory), localAgent)
  })
}
