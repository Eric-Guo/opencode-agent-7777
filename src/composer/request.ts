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
  command?: string
}) {
  const trimmed = input.prompt.trimStart()
  const prefix = input.command ? trimmed.slice(`/${input.command}`.length) : trimmed
  const text = prefix.trim()
  const offset = input.prompt.length - prefix.trimStart().length
  const mention = (reference: PromptReference) => ({
    text: reference.content,
    start: reference.start - offset,
    end: reference.end - offset,
  })
  // Mentions restored from a queued prompt carry their file data; live editor mentions have none.
  const mentions: PromptRequestFile[] = (input.references ?? []).flatMap((reference) =>
    reference.type !== "file" || reference.url === undefined
      ? []
      : [
          {
            uri: reference.url,
            name: reference.path.split(/[\\/]/).pop() ?? reference.path,
            mention: mention(reference),
          },
        ],
  )
  const files: PromptRequestFile[] = input.attachments.map((attachment) => ({
    uri: attachment.url,
    name: attachment.sourcePath ?? attachment.filename,
  }))
  const skills = (input.references ?? []).flatMap((reference) =>
    reference.type === "skill" ? [{ id: reference.id, mention: mention(reference) }] : [],
  )
  return {
    text,
    files: [...mentions, ...files],
    ...(skills.length ? { skills } : {}),
  }
}
