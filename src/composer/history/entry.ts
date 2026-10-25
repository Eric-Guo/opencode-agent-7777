import type { PromptHistoryEntry } from "../schema"
import type { ComposerPrompt } from "../types"
import { clonePrompt, createPromptBuilder, isAttachment, promptText } from "../prompt-parts"

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
  const builder = createPromptBuilder()
  for (const part of prompt) {
    if (isAttachment(part)) continue
    if (part.type === "text") builder.text(part.content)
    else builder.mention(part)
  }
  const entry = cloneHistoryEntry({ prompt: [...builder.build(), ...attachments] })
  if (entries[0] && JSON.stringify(entries[0]) === JSON.stringify(entry)) return entries
  return limitHistoryEntries([entry, ...entries])
}
