import { batch } from "solid-js"
import { createStore, type SetStoreFunction, type Store } from "solid-js/store"
import type { ComposerAttachment, ComposerPersistedState, ComposerPrompt } from "@/composer/types"
import { createLegacyBlobReference } from "@/runtime/persistence/drafts"

export type { Prompt } from "@/composer/types"

export type PromptAttachment = {
  id: string
  filename: string
  sourcePath?: string
  mime: string
  url: string
  blobID?: string
}

export type PromptDraft = {
  prompt: string
  attachments: PromptAttachment[]
}

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
  const prompt: ComposerPrompt = [
    { type: "text", content: draft?.prompt ?? "", start: 0, end: draft?.prompt.length ?? 0 },
    ...(draft?.attachments.map(
      (attachment): ComposerAttachment => ({
        type: "image",
        id: attachment.id,
        filename: attachment.filename,
        sourcePath: attachment.sourcePath,
        mime: attachment.mime,
        blob: attachment.blobID
          ? { id: attachment.blobID, url: attachment.url }
          : createLegacyBlobReference(attachment.url),
      }),
    ) ?? []),
  ]
  return {
    prompt,
    cursor: draft?.prompt.length ?? 0,
    context: { items: [] },
  }
}

function promptText(prompt: ComposerPrompt) {
  return prompt.map((part) => ("content" in part ? part.content : "")).join("")
}

function promptAttachments(prompt: ComposerPrompt): PromptAttachment[] {
  return prompt.flatMap((part) =>
    part.type === "image"
      ? [
          {
            id: part.id,
            filename: part.filename,
            sourcePath: part.sourcePath,
            mime: part.mime,
            url: part.blob.url,
            ...(part.blob.id === part.blob.url ? {} : { blobID: part.blob.id }),
          },
        ]
      : [],
  )
}

function cloneDraft(state: ComposerPersistedState): PromptDraft {
  return {
    prompt: promptText(state.prompt),
    attachments: promptAttachments(state.prompt),
  }
}

export function createPromptState(initial?: PromptDraft, onChange?: PromptStateChange): PromptState {
  const [state, setStore] = createStore(promptState(initial))
  const store: [typeof state, typeof setStore] = [state, setStore]

  const capture = () => cloneDraft(state)
  const changed = () => onChange?.(capture())

  return {
    store,
    current: () => promptText(state.prompt),
    attachments: () => promptAttachments(state.prompt),
    dirty: () => promptText(state.prompt).trim().length > 0 || promptAttachments(state.prompt).length > 0,
    capture,
    persist: changed,
    set(value: string) {
      batch(() => {
        setStore("prompt", (parts) => [
          { type: "text", content: value, start: 0, end: value.length },
          ...parts.filter((part) => part.type === "image"),
        ])
        setStore("cursor", value.length)
      })
      changed()
    },
    addAttachment(attachment: PromptAttachment) {
      setStore("prompt", (parts) => [
        ...parts,
        {
          type: "image",
          id: attachment.id,
          filename: attachment.filename,
          sourcePath: attachment.sourcePath,
          mime: attachment.mime,
          blob: attachment.blobID
            ? { id: attachment.blobID, url: attachment.url }
            : createLegacyBlobReference(attachment.url),
        },
      ])
      changed()
    },
    removeAttachment(id: string) {
      setStore("prompt", (parts) => parts.filter((part) => part.type !== "image" || part.id !== id))
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
