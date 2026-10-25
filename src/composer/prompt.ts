import type { SessionInboxInfo, SessionMessageUser } from "@opencode/client/promise"
import { Skill } from "@opencode/schema/skill"
import { createLegacyBlobReference } from "@/runtime/persistence/drafts"
import type { ComposerAttachment, ComposerPrompt } from "./types"
import type { PromptAttachment, PromptDraft, PromptReference } from "./schema"
import { createPromptBuilder, isAttachment, promptText } from "./prompt-parts"
import { readPromptPresentation } from "./comment-note"

type PromptContent = Pick<SessionMessageUser, "text" | "files" | "agents" | "skills">
type PromptFile = NonNullable<PromptContent["files"]>[number]

export function extractPromptFromMessage(message: SessionMessageUser): PromptDraft {
  const text = readPromptPresentation(message.metadata)?.displayText ?? message.text
  const references = restoreReferences(text, messageReferences(message), "message") ?? []
  return {
    prompt: text,
    attachments: messageAttachments(message.id, message),
    ...(references.length ? { references } : {}),
  }
}

// Queue cancellation must be lossless. Keep model-visible notes and the stored file
// bytes; hidden context and malformed mentions stay queued instead of being dropped.
export function extractPromptFromQueued(item: Extract<SessionInboxInfo, { type: "user" }>): PromptDraft | undefined {
  const payload = item.payload
  if (
    payload.files?.some((file) => !file.mention && file.source.type !== "inline") ||
    payload.agents?.some((agent) => !agent.mention) ||
    payload.skills?.some((skill) => !skill.mention)
  )
    return
  const references = restoreReferences(payload.text, messageReferences(payload, true), "queue")
  if (!references) return
  return {
    prompt: payload.text,
    attachments: messageAttachments(item.id, payload, true),
    ...(references.length ? { references } : {}),
  }
}

function fileUrl(file: PromptFile, snapshot: boolean) {
  return !snapshot && file.source.type === "uri" ? file.source.uri : `data:${file.mime};base64,${file.data}`
}

function messageAttachments(id: string, payload: PromptContent, snapshot = false): PromptDraft["attachments"] {
  return (payload.files ?? []).flatMap((file, index) =>
    file.mention
      ? []
      : [
          {
            id: `${id}:file:${index}`,
            filename: file.name ?? "attachment",
            mime: file.mime,
            url: fileUrl(file, snapshot),
          },
        ],
  )
}

function messageReferences(payload: PromptContent, snapshot = false): PromptReference[] {
  return [
    ...(payload.files ?? []).flatMap((file) =>
      file.mention
        ? [
            {
              type: "file" as const,
              path: file.mention.text.replace(/^@/, ""),
              content: file.mention.text,
              start: file.mention.start,
              end: file.mention.end,
              url: fileUrl(file, snapshot),
            },
          ]
        : [],
    ),
    ...(payload.agents ?? []).flatMap((agent) =>
      agent.mention
        ? [
            {
              type: "agent" as const,
              name: agent.name,
              content: agent.mention.text,
              start: agent.mention.start,
              end: agent.mention.end,
            },
          ]
        : [],
    ),
    ...(payload.skills ?? []).flatMap((skill) =>
      skill.mention
        ? [
            {
              type: "skill" as const,
              id: Skill.ID.make(skill.id),
              name: Skill.Name.make(skill.name),
              content: skill.mention.text,
              start: skill.mention.start,
              end: skill.mention.end,
            },
          ]
        : [],
    ),
  ]
}

function restoreReferences(text: string, references: PromptReference[], source: "message" | "queue" | "draft") {
  const result: PromptReference[] = []
  let position = 0
  // Draft ties preserve stored order; transport references prefer the shorter range.
  const sorted = [...references].sort((a, b) => a.start - b.start || (source === "draft" ? 0 : a.end - b.end))
  for (const reference of sorted) {
    if (
      !Number.isInteger(reference.start) ||
      !Number.isInteger(reference.end) ||
      reference.start < 0 ||
      reference.end <= reference.start ||
      !reference.content
    ) {
      if (source === "queue") return
      continue
    }
    const matches =
      reference.start >= position &&
      reference.end <= text.length &&
      text.slice(reference.start, reference.end) === reference.content
    // Only historical display text may relocate mentions. Drafts skip mismatches;
    // queue cancellation rejects them so context cannot be silently lost.
    const start = matches ? reference.start : source === "message" ? text.indexOf(reference.content, position) : -1
    if (start < 0) {
      if (source === "queue") return
      continue
    }
    const end = start + reference.content.length
    result.push({ ...reference, start, end })
    position = end
  }
  return result
}

// The compact draft format stores mentions as ranges and attachments as URLs.
// Keep conversions at the prompt boundary, separate from reactive state and storage.
export function promptFromDraft(draft?: PromptDraft): ComposerPrompt {
  const text = draft?.prompt ?? ""
  const builder = createPromptBuilder()
  // References overlay the prompt text; the editor stores mentions as inline parts instead.
  const references = restoreReferences(text, draft?.references ?? [], "draft") ?? []
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
