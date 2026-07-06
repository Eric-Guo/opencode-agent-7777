import type { Session } from "@opencode-ai/sdk"
import { translateSync } from "@/context/language"
import type { SessionRecord } from "@/context/local"
import type { OpencodeClient } from "@/context/sdk"
import { defaultSessionDirectory, normalizeSessionDirectory } from "@/context/session-directory"

export function restoreSession(baseClient: OpencodeClient, record: SessionRecord | undefined) {
  if (!record) return Promise.resolve<Session | undefined>(undefined)
  const directory = record.directory ? normalizeSessionDirectory(record.directory) : undefined
  return baseClient.session
    .get({
      path: { id: record.id },
      query: directory ? { directory } : undefined,
    })
    .then((result) => result.data)
    .catch(() => undefined)
}

export function createSession(baseClient: OpencodeClient, directory: string) {
  return baseClient.session
    .create({
      query: { directory: normalizeSessionDirectory(directory) }
    })
    .then((result) => {
      if (!result.data) throw new Error(translateSync("error.createSessionFailed"))
      return result.data
    })
}

export function createDefaultSession(baseClient: OpencodeClient) {
  return baseClient.path.get().then((result) => {
    const paths = result.data as { directory?: unknown; home?: unknown } | undefined
    const baseDirectory = typeof paths?.home === "string" ? paths.home : paths?.directory
    if (typeof baseDirectory !== "string") throw new Error(translateSync("error.loadServerPathFailed"))
    return createSession(baseClient, defaultSessionDirectory(baseDirectory))
  })
}
