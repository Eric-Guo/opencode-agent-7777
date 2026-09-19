import {
  MODEL_SELECTION_KEY,
  SESSION_DIRECTORY_KEY,
  SESSION_ID_KEY,
  SESSION_MODEL_SELECTION_KEY,
} from "@/constants/session"
import { sessionDirectory } from "@/session/directory"
import type { SessionInfo as Session } from "@opencode/client/promise"

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
  storageSet(SESSION_DIRECTORY_KEY, sessionDirectory(session))
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
