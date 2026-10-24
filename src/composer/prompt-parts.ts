import type { ContentPart, Prompt } from "./types"

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
