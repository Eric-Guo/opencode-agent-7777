import type { SessionMessageUser } from "@opencode/client/promise"
import { attached } from "@opencode/session-ui/message-file"
import type { SessionUserPresentation } from "@opencode/session-ui/timeline"
import { getFilename } from "@opencode/util/path"

// The first field is the empty-query preview. Each card supplies its own search excerpt.
export function jumpSearchFields(
  label: string,
  files: SessionMessageUser["files"],
  presentation: SessionUserPresentation | undefined,
  unnamedAttachment: string,
) {
  const fields = [label]
  for (const file of presentation?.references ?? []) fields.push(file.name)
  for (const file of files ?? []) {
    if (attached(file)) fields.push(file.name || unnamedAttachment)
  }
  for (const card of presentation?.comments ?? []) {
    if (card.type === "quote") {
      fields.push(card.text, card.comment ?? "", card.source?.label ?? "")
    } else if (card.type === "note") {
      fields.push(
        card.comment.trim() ? card.comment : card.title?.trim() || card.label,
        card.subtitle?.trim() || card.label,
      )
    } else {
      fields.push(card.comment, getFilename(card.path))
    }
  }
  return fields.filter(Boolean).map((text) => text.replace(/\s+/g, " ").trim())
}

export function matchingJumpSnippet(fields: readonly string[], search: string) {
  for (const text of fields) {
    const match = text.toLowerCase().indexOf(search)
    if (match < 0) continue
    const prefix = Math.max(0, match - 16)
    const space = text.indexOf(" ", prefix)
    const start = prefix && space >= prefix && space < match ? space + 1 : prefix
    const end = Math.max(start + 90, match + search.length + 16)
    return (start ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "")
  }
}
