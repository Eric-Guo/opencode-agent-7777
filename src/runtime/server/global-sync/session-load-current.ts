import { translateSync } from "@/runtime/i18n/language"
import type { SessionRecord } from "@/runtime/persistence/storage-compact"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { isSessionNotFoundError } from "@/runtime/server/errors"
import { defaultSessionDirectory } from "@/session/directory"

export async function restoreSession(
  baseClient: OpencodeClient,
  record: SessionRecord | undefined,
  signal?: AbortSignal,
) {
  if (!record) return
  try {
    const session = await baseClient.session.get({ sessionID: record.id }, { signal })
    if (session?.id !== record.id) throw new Error(translateSync("error.requestFailed"))
    return session
  } catch (error) {
    // Activating a draft clears the saved ID. Only the server can confirm it is gone.
    if (!isSessionNotFoundError(error, record.id)) throw error
  }
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
