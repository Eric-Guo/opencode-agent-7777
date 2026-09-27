import type { PromptAttachment, PromptReference } from "./schema"

type PromptRequestFile = {
  uri: string
  name: string
  mention?: { text: string; start: number; end: number }
}

export function buildPromptRequest(input: {
  prompt: string
  attachments: readonly PromptAttachment[]
  references?: readonly PromptReference[]
}) {
  // Mentions restored from a queued prompt carry their file data; live editor mentions have none.
  const mentions: PromptRequestFile[] = (input.references ?? []).flatMap((reference) =>
    reference.url === undefined
      ? []
      : [
          {
            uri: reference.url,
            name: reference.path.split(/[\\/]/).pop() ?? reference.path,
            mention: { text: reference.content, start: reference.start, end: reference.end },
          },
        ],
  )
  const files: PromptRequestFile[] = input.attachments.map((attachment) => ({
    uri: attachment.url,
    name: attachment.sourcePath ?? attachment.filename,
  }))
  return {
    text: input.prompt.trim(),
    files: [...mentions, ...files],
  }
}
