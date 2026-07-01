import type { Session } from "@opencode-ai/sdk"
import type { SessionRecord } from "@/context/local"
import type { OpencodeClient } from "@/context/sdk"

export function restoreSession(baseClient: OpencodeClient, record: SessionRecord | undefined) {
  if (!record) return Promise.resolve<Session | undefined>(undefined)
  return baseClient.session
    .get({
      path: { id: record.id },
      query: record.directory ? { directory: record.directory } : undefined,
    })
    .then((result) => result.data)
    .catch(() => undefined)
}

export function createSession(baseClient: OpencodeClient) {
  return baseClient.session
    .create({
      body: {
        title: "7777",
      },
    })
    .then((result) => {
      if (!result.data) throw new Error("Failed to create 7777 session")
      return result.data
    })
}
