import { batch, untrack, type Accessor } from "solid-js"
import type { SetStoreFunction, Store } from "solid-js/store"
import type {
  ComposerAgentPart,
  ComposerFilePart,
  ComposerSkillPart,
  ComposerPersistedState,
  ComposerPrompt,
} from "../types"
import {
  insertPromptMention,
  insertPromptText,
  promptLength,
  promptText,
  removePromptAttachment,
  replacePromptText,
} from "../prompt-parts"

export type ComposerStateStore = [
  Store<ComposerPersistedState> | Accessor<Store<ComposerPersistedState>>,
  SetStoreFunction<ComposerPersistedState>,
]

export type ComposerStateStoreInput = ComposerStateStore | Accessor<ComposerStateStore>

export function createComposerEditorActions(input: ComposerStateStoreInput, onChange?: () => void) {
  const tuple = () => (typeof input === "function" ? input() : input)
  const store = () => {
    const value = tuple()[0]
    return typeof value === "function" ? value() : value
  }
  const setStore = () => tuple()[1]
  const clearRetry = () => {
    if (untrack(() => store().retry) !== undefined) setStore()("retry", undefined)
  }

  return {
    get state() {
      return store()
    },
    setPrompt(prompt: ComposerPrompt, cursor?: number) {
      // Persisted setters encode on every call, even inside a reactive batch.
      batch(() => setStore()({ prompt, ...(cursor !== undefined ? { cursor } : {}), retry: undefined }))
      onChange?.()
    },
    setCursor(cursor: number) {
      if (untrack(() => store().cursor) === cursor) return
      setStore()("cursor", cursor)
      onChange?.()
    },
    setMode(mode: "normal" | "shell") {
      if (untrack(() => store().mode === mode && store().retry === undefined)) return
      setStore()({ mode, retry: undefined })
      onChange?.()
    },
    setText(content: string) {
      batch(() =>
        setStore()((state) => ({
          prompt: replacePromptText(state.prompt, content),
          cursor: content.length,
          retry: undefined,
        })),
      )
      onChange?.()
    },
    addText(content: string) {
      const cursor = store().cursor ?? promptLength(store().prompt)
      batch(() =>
        setStore()((state) => ({
          prompt: insertPromptText(state.prompt, cursor, content),
          cursor: cursor + content.length,
          retry: undefined,
        })),
      )
      onChange?.()
    },
    removeContext(key: string) {
      setStore()("context", "items", (items) => items.filter((item) => item.key !== key))
      clearRetry()
      onChange?.()
    },
    addMention(
      mention: ComposerFilePart | ComposerAgentPart | ComposerSkillPart,
      range?: { start: number; end: number },
    ) {
      const text = promptText(store().prompt)
      const end = range?.end ?? store().cursor ?? text.length
      const start = range?.start ?? text.slice(0, end).lastIndexOf("@")
      setStore()("prompt", insertPromptMention(store().prompt, start < 0 ? end : start, end, mention))
      setStore()("cursor", (start < 0 ? end : start) + mention.content.length + 1)
      clearRetry()
      onChange?.()
    },
    removeAttachment(id: string) {
      setStore()("prompt", (parts) => removePromptAttachment(parts, id))
      clearRetry()
      onChange?.()
    },
  }
}
