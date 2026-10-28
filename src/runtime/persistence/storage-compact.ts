import type { SessionInfo as Session } from "@opencode/client/promise"
import { AGENT_DEFAULT_CONFIG } from "@/new-session/agent-default-config"
import { sessionDirectory } from "@/session/directory"
import { storageGet, storageRemove, storageSet } from "./storage"

// Narrow persistence helpers rather than the main app's reactive local-preferences context.

export type SessionRecord = {
  id: string
  directory?: string
}

export function readSessionRecord(keys = AGENT_DEFAULT_CONFIG.storageKeys): SessionRecord | undefined {
  const id = storageGet(keys.sessionID)
  if (!id) return
  return {
    id,
    directory: storageGet(keys.sessionDirectory) ?? undefined,
  }
}

export function writeSessionRecord(session: Session, keys = AGENT_DEFAULT_CONFIG.storageKeys) {
  storageSet(keys.sessionID, session.id)
  storageSet(keys.sessionDirectory, sessionDirectory(session))
}

export function readSessionDirectory(keys = AGENT_DEFAULT_CONFIG.storageKeys) {
  return storageGet(keys.sessionDirectory) ?? undefined
}

export function writeSessionDraft(directory: string, keys = AGENT_DEFAULT_CONFIG.storageKeys) {
  storageRemove(keys.sessionID)
  storageSet(keys.sessionDirectory, directory)
}
