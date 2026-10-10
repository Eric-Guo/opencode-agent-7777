import { batch } from "solid-js"
import { createStore, type SetStoreFunction, type Store } from "solid-js/store"
import type { ComposerPersistedState } from "@/composer/types"
import type { PromptAttachment, PromptDraft } from "./schema"
import { isAttachment, promptText } from "./prompt-parts"
import { attachmentFromDraft, draftAttachments, draftFromPrompt, promptFromDraft } from "./prompt"

export type { Prompt } from "@/composer/types"
export type { PromptAttachment, PromptDraft } from "./schema"

type PromptStateChange = (draft: PromptDraft) => void

export type PromptState = {
  store: [Store<ComposerPersistedState>, SetStoreFunction<ComposerPersistedState>]
  current: () => string
  attachments: () => PromptAttachment[]
  dirty: () => boolean
  capture: () => PromptDraft
  persist: () => void
  set: (value: string) => void
  addAttachment: (attachment: PromptAttachment) => void
  removeAttachment: (id: string) => void
  restore: (draft?: PromptDraft) => void
  reset: () => void
}

function promptState(draft?: PromptDraft): ComposerPersistedState {
  return {
    prompt: promptFromDraft(draft),
    cursor: draft?.prompt.length ?? 0,
    context: { items: [] },
  }
}

export function createPromptState(initial?: PromptDraft, onChange?: PromptStateChange): PromptState {
  const [state, setStore] = createStore(promptState(initial))
  const store: [typeof state, typeof setStore] = [state, setStore]

  const capture = () => draftFromPrompt(state.prompt)
  const changed = () => onChange?.(capture())

  return {
    store,
    current: () => promptText(state.prompt),
    attachments: () => draftAttachments(state.prompt),
    dirty: () => promptText(state.prompt).trim().length > 0 || draftAttachments(state.prompt).length > 0,
    capture,
    persist: changed,
    set(value: string) {
      batch(() => {
        setStore("prompt", (parts) => [
          { type: "text", content: value, start: 0, end: value.length },
          ...parts.filter(isAttachment),
        ])
        setStore("cursor", value.length)
      })
      changed()
    },
    addAttachment(attachment: PromptAttachment) {
      setStore("prompt", (parts) => [...parts, attachmentFromDraft(attachment)])
      changed()
    },
    removeAttachment(id: string) {
      setStore("prompt", (parts) => parts.filter((part) => !isAttachment(part) || part.id !== id))
      changed()
    },
    restore(draft?: PromptDraft) {
      setStore(promptState(draft))
      changed()
    },
    reset() {
      setStore(promptState())
      changed()
    },
  }
}
