import { PROMPT_DRAFT_KEY } from "@/constants/session"
import { setState, state } from "@/context/server-session"

export type PromptAttachment = {
  id: string
  filename: string
  sourcePath?: string
  mime: string
  url: string
}

export type PromptDraft = {
  prompt: string
  attachments: PromptAttachment[]
}

function storageGet() {
  if (typeof localStorage !== "object") return null
  try {
    return localStorage.getItem(PROMPT_DRAFT_KEY)
  } catch {
    return null
  }
}

function storageSet(value: string) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(PROMPT_DRAFT_KEY, value)
  } catch {
    return
  }
}

function storageRemove() {
  if (typeof localStorage !== "object") return
  try {
    localStorage.removeItem(PROMPT_DRAFT_KEY)
  } catch {
    return
  }
}

function readPromptAttachment(value: unknown): PromptAttachment | undefined {
  if (!value || typeof value !== "object") return undefined
  const attachment = value as Partial<Record<keyof PromptAttachment, unknown>>
  if (typeof attachment.id !== "string") return undefined
  if (typeof attachment.filename !== "string") return undefined
  if (typeof attachment.mime !== "string") return undefined
  if (typeof attachment.url !== "string") return undefined
  const sourcePath = typeof attachment.sourcePath === "string" ? attachment.sourcePath : undefined
  return {
    id: attachment.id,
    filename: attachment.filename,
    mime: attachment.mime,
    url: attachment.url,
    ...(sourcePath ? { sourcePath } : {}),
  }
}

export function readPromptDraft(): PromptDraft | undefined {
  const value = storageGet()
  if (!value) return undefined
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
      storageRemove()
      return undefined
    }
    return { prompt, attachments }
  } catch {
    storageRemove()
    return undefined
  }
}

export function writePromptDraft(draft: PromptDraft) {
  if (!draft.prompt && draft.attachments.length === 0) {
    storageRemove()
    return
  }
  storageSet(JSON.stringify(draft))
}

export function clearPromptDraft() {
  storageRemove()
}

export function setPrompt(value: string) {
  setState("prompt", value)
  writePromptDraft({ prompt: value, attachments: state.attachments })
}

export function addAttachment(attachment: PromptAttachment) {
  const attachments = [...state.attachments, attachment]
  setState("attachments", attachments)
  writePromptDraft({ prompt: state.prompt, attachments })
}

export function removeAttachment(id: string) {
  const attachments = state.attachments.filter((attachment) => attachment.id !== id)
  setState("attachments", attachments)
  writePromptDraft({ prompt: state.prompt, attachments })
}
