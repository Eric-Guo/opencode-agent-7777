import type { SessionMessageUser } from "@opencode/client/promise"
import type { PromptDraft } from "./schema"
import { readPromptPresentation } from "./comment-note"

export function extractPromptFromMessage(message: SessionMessageUser): PromptDraft {
  const text = readPromptPresentation(message.metadata)?.displayText ?? message.text
  const references = (message.files ?? [])
    .flatMap((file) => {
      const mention = file.mention
      if (!mention || file.source.type !== "uri" || !file.source.uri.startsWith("file://")) return []
      if (text.slice(mention.start, mention.end) !== mention.text) return []
      return [
        {
          type: "file" as const,
          path: mention.text.replace(/^@/, ""),
          content: mention.text,
          start: mention.start,
          end: mention.end,
          url: file.source.uri,
        },
      ]
    })
    .sort((a, b) => a.start - b.start)
  return {
    prompt: text,
    ...(references.length ? { references } : {}),
    attachments: (message.files ?? []).flatMap((file, index) => {
      if (file.mention) return []
      const url = file.source.type === "uri" ? file.source.uri : `data:${file.mime};base64,${file.data}`
      return [
        {
          id: `${message.id}:file:${index}`,
          filename: file.name ?? "attachment",
          mime: file.mime,
          url,
        },
      ]
    }),
  }
}
