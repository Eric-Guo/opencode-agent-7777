import { batch } from "solid-js"
import { createStore, type SetStoreFunction, type Store } from "solid-js/store"
import type { ComposerAttachment, ComposerPersistedState, ComposerPrompt } from "@/composer/types"
import { createLegacyBlobReference } from "@/runtime/persistence/drafts"
import type { PromptAttachment, PromptDraft } from "./schema"

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
  const text = draft?.prompt ?? ""
  const parts: ComposerPrompt = []
  let offset = 0
  for (const reference of draft?.references ?? []) {
    if (reference.start < offset || text.slice(reference.start, reference.end) !== reference.content) continue
    if (reference.start > offset)
      parts.push({ type: "text", content: text.slice(offset, reference.start), start: offset, end: reference.start })
    parts.push({ ...reference })
    offset = reference.end
  }
  parts.push({ type: "text", content: text.slice(offset), start: offset, end: text.length })
  const prompt: ComposerPrompt = [
    ...parts,
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
  const references = state.prompt.flatMap((part) =>
    part.type === "file"
      ? [
          {
            type: "file" as const,
            path: part.path,
            content: part.content,
            start: part.start,
            end: part.end,
            ...(part.url ? { url: part.url } : {}),
          },
        ]
      : [],
  )
  return {
    prompt: promptText(state.prompt),
    attachments: promptAttachments(state.prompt),
    ...(references.length ? { references } : {}),
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
