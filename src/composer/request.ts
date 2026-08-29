import type { PromptAttachment } from "./state-compact"

export function buildPromptRequest(input: { prompt: string; attachments: readonly PromptAttachment[] }) {
  return {
    text: input.prompt.trim(),
    files: input.attachments.map((attachment) => ({
      uri: attachment.url,
      name: attachment.sourcePath ?? attachment.filename,
    })),
  }
}
