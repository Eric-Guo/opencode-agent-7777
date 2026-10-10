import type { PromptHistoryEntry } from "../schema"
import type { ComposerPrompt } from "../types"
import { clonePrompt, isAttachment, promptText } from "../prompt-parts"

export type { PromptHistoryEntry } from "../schema"
export const MAX_HISTORY = 100
// Inline data URLs share localStorage with the draft and preferences. Bound UTF-16 storage to about 2 MB.
export const MAX_HISTORY_CHARS = 1_000_000

export function cloneHistoryEntry(entry: PromptHistoryEntry): PromptHistoryEntry {
  return {
    prompt: clonePrompt(entry.prompt),
  }
}

export function limitHistoryEntries(entries: PromptHistoryEntry[], max = MAX_HISTORY, maxChars = MAX_HISTORY_CHARS) {
  const result: PromptHistoryEntry[] = []
  let size = '{"entries":[]}'.length
  for (const entry of entries) {
    if (result.length >= max) break
    const length = JSON.stringify(entry).length + (result.length ? 1 : 0)
    if (size + length > maxChars) continue
    result.push(entry)
    size += length
  }
  return result
}

export function prependHistoryEntry(entries: PromptHistoryEntry[], prompt: ComposerPrompt) {
  const content = promptText(prompt)
  const attachments = prompt.filter(isAttachment)
  if (!content.trim() && !attachments.length) return entries
  let offset = 0
  let text = ""
  const parts: PromptHistoryEntry["prompt"] = []
  const flush = () => {
    if (!text) return
    parts.push({ type: "text", content: text, start: offset - text.length, end: offset })
    text = ""
  }
  for (const part of prompt) {
    if (isAttachment(part)) continue
    if (part.type === "skill" || part.type === "file" || part.type === "agent") {
      flush()
      parts.push({ ...part, start: offset, end: offset + part.content.length })
    } else text += part.content
    offset += part.content.length
  }
  flush()
  if (!parts.length) parts.push({ type: "text", content: "", start: 0, end: 0 })
  const entry = cloneHistoryEntry({
    prompt: [...parts, ...attachments],
  })
  if (entries[0] && JSON.stringify(entries[0]) === JSON.stringify(entry)) return entries
  return limitHistoryEntries([entry, ...entries])
}
