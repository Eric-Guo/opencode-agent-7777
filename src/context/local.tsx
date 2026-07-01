import type { Session } from "@opencode-ai/sdk"
import { SESSION_DIRECTORY_KEY, SESSION_ID_KEY } from "@/constants/session"

export type SessionRecord = {
  id: string
  directory?: string
}

function storageGet(key: string) {
  if (typeof localStorage !== "object") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

export function readSessionRecord(): SessionRecord | undefined {
  const id = storageGet(SESSION_ID_KEY)
  if (!id) return
  return {
    id,
    directory: storageGet(SESSION_DIRECTORY_KEY) ?? undefined,
  }
}

export function writeSessionRecord(session: Session) {
  storageSet(SESSION_ID_KEY, session.id)
  storageSet(SESSION_DIRECTORY_KEY, session.directory)
}
