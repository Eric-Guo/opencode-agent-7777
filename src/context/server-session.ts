import type { Session } from "@opencode-ai/sdk"
import type { SessionRecord } from "@/context/local"
import type { OpencodeClient } from "@/context/sdk"
import { normalizeSessionDirectory } from "@/context/session-directory"

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
      query: { directory: normalizeSessionDirectory(directory) },
      body: {
        title: "7777",
      },
    })
    .then((result) => {
      if (!result.data) throw new Error("Failed to create 7777 session")
      return result.data
    })
}
