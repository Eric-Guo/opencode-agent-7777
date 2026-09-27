import type { SessionInfo as Session } from "@opencode/client/promise"
import { MODEL_SELECTION_KEY, SESSION_MODEL_SELECTION_KEY } from "@/constants/session"
import { AGENT_DEFAULT_CONFIG } from "@/new-session/agent-default-config"
import { sessionDirectory } from "@/session/directory"
import { storageGet, storageSet } from "./storage"

// Narrow persistence helpers rather than the main app's reactive local-preferences context.

export type SessionRecord = {
  id: string
  directory?: string
}

export type ModelSelection = {
  providerID: string
  modelID: string
}

export type SessionModelSelection = {
  model: ModelSelection
  // null is an explicit Default, not permission to fall back to a preference.
  variant: string | null
}

export type SessionModelSelections = Record<string, SessionModelSelection | undefined>

export function readSessionModelSelections(): SessionModelSelections {
  try {
    const parsed: unknown = JSON.parse(storageGet(SESSION_MODEL_SELECTION_KEY) ?? "{}")
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => {
        if (!value || typeof value !== "object") return false
        return (
          typeof value.model?.providerID === "string" &&
          typeof value.model?.modelID === "string" &&
          (value.variant === null || typeof value.variant === "string")
        )
      }),
    )
  } catch {
    return {}
  }
}

export function writeSessionModelSelections(value: SessionModelSelections) {
  storageSet(SESSION_MODEL_SELECTION_KEY, JSON.stringify(value))
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

export function readModelSelection(): ModelSelection | undefined {
  const value = storageGet(MODEL_SELECTION_KEY)
  if (!value) return
  try {
    const parsed = JSON.parse(value) as Partial<ModelSelection>
    if (typeof parsed.providerID !== "string" || typeof parsed.modelID !== "string") return
    return {
      providerID: parsed.providerID,
      modelID: parsed.modelID,
    }
  } catch {
    return
  }
}

export function writeModelSelection(model: ModelSelection | undefined) {
  if (!model) return
  storageSet(MODEL_SELECTION_KEY, JSON.stringify(model))
}
