import type { SessionMessageUser } from "@opencode-ai/client/promise"
import type { PromptDraft } from "@/context/prompt"
import { readPromptPresentation } from "./comment-note"

export function extractPromptFromMessage(message: SessionMessageUser): PromptDraft {
  return {
    prompt: readPromptPresentation(message.metadata)?.displayText ?? message.text,
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
