import type { Session } from "@opencode-ai/sdk"
import {
  MODEL_SELECTION_KEY,
  PROMPT_DRAFT_KEY,
  SESSION_DIRECTORY_KEY,
  SESSION_ID_KEY,
  SHOW_REASONING_SUMMARIES_KEY,
  SHOW_TOOLS_PART_KEY,
} from "@/constants/session"
import type { PromptAttachment } from "@/context/server-session"

export type SessionRecord = {
  id: string
  directory?: string
}

export type ModelSelection = {
  providerID: string
  modelID: string
}

export type PromptDraft = {
  prompt: string
  attachments: PromptAttachment[]
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

function storageRemove(key: string) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.removeItem(key)
  } catch {
    return
  }
}

function readPromptAttachment(value: unknown): PromptAttachment | undefined {
  if (!value || typeof value !== "object") return
  const attachment = value as Partial<Record<keyof PromptAttachment, unknown>>
  if (typeof attachment.id !== "string") return
  if (typeof attachment.filename !== "string") return
  if (typeof attachment.mime !== "string") return
  if (typeof attachment.url !== "string") return
  const sourcePath = typeof attachment.sourcePath === "string" ? attachment.sourcePath : undefined
  return {
    id: attachment.id,
    filename: attachment.filename,
    mime: attachment.mime,
    url: attachment.url,
    ...(sourcePath ? { sourcePath } : {}),
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

export function readShowReasoningSummaries() {
  return storageGet(SHOW_REASONING_SUMMARIES_KEY) === "true"
}

export function writeShowReasoningSummaries(value: boolean) {
  storageSet(SHOW_REASONING_SUMMARIES_KEY, value ? "true" : "false")
}

export function readShowToolsPart() {
  return storageGet(SHOW_TOOLS_PART_KEY) === "true"
}

export function writeShowToolsPart(value: boolean) {
  storageSet(SHOW_TOOLS_PART_KEY, value ? "true" : "false")
}

export function readPromptDraft(): PromptDraft | undefined {
  const value = storageGet(PROMPT_DRAFT_KEY)
  if (!value) return
  try {
    const parsed = JSON.parse(value) as { prompt?: unknown; attachments?: unknown }
    const prompt = typeof parsed.prompt === "string" ? parsed.prompt : ""
    const attachments = Array.isArray(parsed.attachments)
      ? parsed.attachments.flatMap((attachment) => {
          const next = readPromptAttachment(attachment)
          return next ? [next] : []
        })
      : []
    if (!prompt && attachments.length === 0) {
      storageRemove(PROMPT_DRAFT_KEY)
      return
    }
    return {
      prompt,
      attachments,
    }
  } catch {
    storageRemove(PROMPT_DRAFT_KEY)
    return
  }
}

export function writePromptDraft(draft: PromptDraft) {
  if (!draft.prompt && draft.attachments.length === 0) {
    storageRemove(PROMPT_DRAFT_KEY)
    return
  }
  storageSet(PROMPT_DRAFT_KEY, JSON.stringify(draft))
}

export function clearPromptDraft() {
  storageRemove(PROMPT_DRAFT_KEY)
}
