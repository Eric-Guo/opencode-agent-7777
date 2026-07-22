import { batch } from "solid-js"
import { createStore } from "solid-js/store"
import { PROMPT_DRAFT_KEY } from "@/constants/session"

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

type PromptStateChange = (draft: PromptDraft) => void

function cloneDraft(draft?: PromptDraft): PromptDraft {
  return {
    prompt: draft?.prompt ?? "",
    attachments: draft?.attachments.map((attachment) => ({ ...attachment })) ?? [],
  }
}

export function createPromptState(initial?: PromptDraft, onChange?: PromptStateChange) {
  const [store, setStore] = createStore<PromptDraft>(cloneDraft(initial))

  const capture = () => cloneDraft(store)
  const changed = () => onChange?.(capture())

  return {
    current: () => store.prompt,
    attachments: () => store.attachments,
    dirty: () => store.prompt.trim().length > 0 || store.attachments.length > 0,
    capture,
    set(value: string) {
      setStore("prompt", value)
      changed()
    },
    addAttachment(attachment: PromptAttachment) {
      setStore("attachments", (attachments) => [...attachments, { ...attachment }])
      changed()
    },
    removeAttachment(id: string) {
      setStore("attachments", (attachments) => attachments.filter((attachment) => attachment.id !== id))
      changed()
    },
    restore(draft?: PromptDraft) {
      const next = cloneDraft(draft)
      batch(() => {
        setStore("prompt", next.prompt)
        setStore("attachments", next.attachments)
      })
      changed()
    },
    reset() {
      batch(() => {
        setStore("prompt", "")
        setStore("attachments", [])
      })
      changed()
    },
  }
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
