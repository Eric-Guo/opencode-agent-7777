import { createLegacyBlobReference } from "@/runtime/persistence/drafts"
import type { ComposerAttachment, ComposerPrompt } from "./types"
import type { PromptAttachment, PromptDraft, PromptReference } from "./schema"
import { createPromptBuilder, isAttachment, promptText } from "./prompt-parts"
function restoreReferences(text: string, references: PromptReference[]) {
  let position = 0
  return references
    .toSorted((a, b) => a.start - b.start)
    .filter((ref) => {
      if (
        !Number.isInteger(ref.start) ||
        !Number.isInteger(ref.end) ||
        !ref.content ||
        ref.start < position ||
        ref.end > text.length ||
        text.slice(ref.start, ref.end) !== ref.content
      )
        return false
      position = ref.end
      return true
    })
}

// The compact draft format stores mentions as ranges and attachments as URLs.
// Keep conversions at the prompt boundary, separate from reactive state and storage.
export function promptFromDraft(draft?: PromptDraft): ComposerPrompt {
  const text = draft?.prompt ?? ""
  const builder = createPromptBuilder()
  // References overlay the prompt text; the editor stores mentions as inline parts instead.
  const references = restoreReferences(text, draft?.references ?? [])
  let position = 0
  for (const reference of references) {
    if (reference.start > position) builder.text(text.slice(position, reference.start))
    builder.mention(reference)
    position = reference.end
  }
  builder.text(text.slice(position))
  return [...builder.build(), ...(draft?.attachments.map(attachmentFromDraft) ?? [])]
}

export function attachmentFromDraft(attachment: PromptAttachment): ComposerAttachment {
  return {
    type: "image",
    id: attachment.id,
    filename: attachment.filename,
    sourcePath: attachment.sourcePath,
    mime: attachment.mime,
    blob: attachment.blobID
      ? { id: attachment.blobID, url: attachment.url }
      : createLegacyBlobReference(attachment.url),
  }
}

export function draftAttachments(prompt: ComposerPrompt): PromptAttachment[] {
  return prompt.flatMap((part) =>
    isAttachment(part)
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

function draftReferences(prompt: ComposerPrompt): PromptReference[] {
  return prompt.flatMap<PromptReference>((part) => {
    if (part.type === "skill" || part.type === "agent") return [{ ...part }]
    if (part.type !== "file") return []
    const reference: PromptReference = {
      type: "file",
      path: part.path,
      content: part.content,
      start: part.start,
      end: part.end,
    }
    if (part.url !== undefined) reference.url = part.url
    return [reference]
  })
}

export function draftFromPrompt(prompt: ComposerPrompt): PromptDraft {
  const references = draftReferences(prompt)
  return {
    prompt: promptText(prompt),
    attachments: draftAttachments(prompt),
    ...(references.length ? { references } : {}),
  }
}
