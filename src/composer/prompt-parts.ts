import type { ContentPart, Prompt } from "./types"

type InlinePart = Exclude<ContentPart, { type: "image" }>
type MentionPart = Exclude<InlinePart, { type: "text" }>
type WithoutOffsets<T> = T extends InlinePart ? Omit<T, "start" | "end"> : never

/** Parts that sit beside the text rather than inside it. */
export function isAttachment<T extends ContentPart>(part: T): part is Extract<T, { type: "image" }> {
  return part.type === "image"
}

export function clonePrompt<T extends ContentPart>(prompt: T[]): T[] {
  return prompt.map((part) => {
    if (isAttachment(part)) return { ...part, blob: { ...part.blob } }
    if (part.type === "file") return { ...part, selection: part.selection ? { ...part.selection } : undefined }
    return { ...part }
  })
}

export function promptText(prompt: Prompt) {
  return prompt.map((part) => ("content" in part ? part.content : "")).join("")
}

export function promptLength(prompt: Prompt) {
  return prompt.reduce((length, part) => length + ("content" in part ? part.content.length : 0), 0)
}

// DOM parsing and history merge adjacent text; editor edits retain their part boundaries.
// Both use the same UTF-16 offsets, with attachments taking no space in the text.
function withPromptOffsets<T extends ContentPart>(prompt: T[]): T[] {
  let offset = 0
  return prompt.map((part) => {
    if (part.type === "image") return part
    const next = { ...part, start: offset, end: offset + part.content.length }
    offset = next.end
    return next
  })
}

export function createPromptBuilder() {
  const parts: InlinePart[] = []
  let text = ""
  const flush = () => {
    if (text) parts.push({ type: "text", content: text, start: 0, end: 0 })
    text = ""
  }
  return {
    text(content: string) {
      text += content
    },
    mention(part: WithoutOffsets<MentionPart>) {
      flush()
      parts.push({ ...part, start: 0, end: 0 })
    },
    build(): InlinePart[] {
      flush()
      return withPromptOffsets(parts.length ? parts : [{ type: "text", content: "", start: 0, end: 0 }])
    },
  }
}

// Text replacement discards inline mentions but keeps the attachments beside the editor.
export function replacePromptText(prompt: Prompt, content: string): Prompt {
  return [{ type: "text", content, start: 0, end: content.length }, ...prompt.filter(isAttachment)]
}

export function removePromptAttachment(prompt: Prompt, id: string): Prompt {
  return prompt.filter((part) => !isAttachment(part) || part.id !== id)
}

export function appendPrompt(prompt: Prompt, following: Prompt): Prompt {
  const start = promptLength(prompt)
  const offset = start + 2
  return [
    ...clonePrompt(prompt),
    { type: "text", content: "\n\n", start, end: offset },
    ...clonePrompt(following).map((part) =>
      isAttachment(part) ? part : { ...part, start: part.start + offset, end: part.end + offset },
    ),
  ]
}

export function insertPromptText(prompt: Prompt, cursor: number, content: string): Prompt {
  let position = 0
  let inserted = false
  const parts = prompt.flatMap<Prompt[number]>((part) => {
    if (isAttachment(part)) return [part]
    const start = position
    position += part.content.length
    if (inserted) return [part]
    if (part.type === "text" && cursor >= start && cursor <= position) {
      inserted = true
      const offset = cursor - start
      return [{ ...part, content: part.content.slice(0, offset) + content + part.content.slice(offset) }]
    }
    if (cursor > start) return [part]
    inserted = true
    return [{ type: "text", content, start: 0, end: 0 }, part]
  })
  if (!inserted) parts.push({ type: "text", content, start: 0, end: 0 })
  return withPromptOffsets(parts)
}

export function insertPromptMention(prompt: Prompt, start: number, end: number, mention: MentionPart): Prompt {
  if (start === 0 && end === 0) {
    return withPromptOffsets([mention, { type: "text", content: " ", start: 0, end: 0 }, ...prompt])
  }
  let position = 0
  const parts = prompt.flatMap<Prompt[number]>((part) => {
    if (isAttachment(part)) return [part]
    const partStart = position
    position += part.content.length
    if (part.type !== "text" || start < partStart || end > position) return [part]
    const before = part.content.slice(0, start - partStart)
    const after = part.content.slice(end - partStart)
    return [
      ...(before ? [{ type: "text" as const, content: before, start: 0, end: 0 }] : []),
      mention,
      { type: "text" as const, content: ` ${after}`, start: 0, end: 0 },
    ]
  })
  return withPromptOffsets(parts)
}
