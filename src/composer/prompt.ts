import type { SessionInboxInfo, SessionMessageUser } from "@opencode/client/promise"
import { Skill } from "@opencode/schema/skill"
import type { PromptDraft, PromptReference } from "./schema"
import { readPromptPresentation } from "./comment-note"

type PromptContent = Pick<SessionMessageUser, "text" | "files" | "agents" | "skills">
type PromptFile = NonNullable<PromptContent["files"]>[number]

export function extractPromptFromMessage(message: SessionMessageUser): PromptDraft {
  const text = readPromptPresentation(message.metadata)?.displayText ?? message.text
  const references = restoreReferences(text, promptReferences(message), false) ?? []
  return {
    prompt: text,
    attachments: promptAttachments(message.id, message),
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
  const references = restoreReferences(payload.text, promptReferences(payload, true), true)
  if (!references) return
  return {
    prompt: payload.text,
    attachments: promptAttachments(item.id, payload, true),
    ...(references.length ? { references } : {}),
  }
}

function fileUrl(file: PromptFile, snapshot: boolean) {
  return !snapshot && file.source.type === "uri" ? file.source.uri : `data:${file.mime};base64,${file.data}`
}

function promptAttachments(id: string, payload: PromptContent, snapshot = false): PromptDraft["attachments"] {
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

function promptReferences(payload: PromptContent, snapshot = false): PromptReference[] {
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

function restoreReferences(text: string, references: PromptReference[], exact: boolean): PromptReference[] | undefined {
  const result: PromptReference[] = []
  let position = 0
  for (const reference of references.sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (
      !Number.isInteger(reference.start) ||
      !Number.isInteger(reference.end) ||
      reference.start < 0 ||
      reference.end <= reference.start ||
      !reference.content
    ) {
      if (exact) return
      continue
    }
    const matches =
      reference.start >= position &&
      reference.end <= text.length &&
      text.slice(reference.start, reference.end) === reference.content
    // Historical display text can have different offsets. Match each mention in
    // order, as the main app does, without bringing hidden notes into the editor.
    const start = matches ? reference.start : exact ? -1 : text.indexOf(reference.content, position)
    if (start < 0) {
      if (exact) return
      continue
    }
    const end = start + reference.content.length
    result.push({ ...reference, start, end })
    position = end
  }
  return result
}
