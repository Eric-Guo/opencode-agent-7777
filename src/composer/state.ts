import { batch, createSignal } from "solid-js"
import { createStore, type SetStoreFunction, type Store } from "solid-js/store"
import type { ComposerPersistedState } from "@/composer/types"
import type { PromptAttachment, PromptDraft } from "./schema"
import { promptText, removePromptAttachment, replacePromptText } from "./prompt-parts"
import { attachmentFromDraft, draftAttachments, draftFromPrompt, promptFromDraft } from "./prompt"

export type { Prompt } from "@/composer/types"
export type { PromptAttachment, PromptDraft } from "./schema"

type PromptStateChange = (draft: PromptDraft) => void

export type PromptState = {
  store: [Store<ComposerPersistedState>, SetStoreFunction<ComposerPersistedState>]
  scope: () => object
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
    retry: draft?.retry && { ...draft.retry },
    context: { items: [] },
  }
}

export function createPromptState(initial?: PromptDraft, onChange?: PromptStateChange): PromptState {
  const [scope, setScope] = createSignal<object>({})
  const [state, setStore] = createStore(promptState(initial))
  const store: [typeof state, typeof setStore] = [state, setStore]

  const capture = () => draftFromPrompt(state.prompt)
  // Content captures also seed forks and queue undo. Only the saved tab draft carries a retry.
  const changed = () => onChange?.({ ...capture(), ...(state.retry && { retry: { ...state.retry } }) })

  return {
    store,
    scope,
    current: () => promptText(state.prompt),
    attachments: () => draftAttachments(state.prompt),
    dirty: () => promptText(state.prompt).trim().length > 0 || draftAttachments(state.prompt).length > 0,
    capture,
    persist: changed,
    set(value: string) {
      batch(() => {
        setStore("prompt", (parts) => replacePromptText(parts, value))
        setStore("cursor", value.length)
        setStore("retry", undefined)
      })
      changed()
    },
    addAttachment(attachment: PromptAttachment) {
      setStore("prompt", (parts) => [...parts, attachmentFromDraft(attachment)])
      setStore("retry", undefined)
      changed()
    },
    removeAttachment(id: string) {
      setStore("prompt", (parts) => removePromptAttachment(parts, id))
      setStore("retry", undefined)
      changed()
    },
    restore(draft?: PromptDraft) {
      setScope({})
      setStore(promptState(draft))
      changed()
    },
    reset() {
      setScope({})
      setStore(promptState())
      changed()
    },
  }
}
