import { getFilename } from "@opencode/util/path"
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
  // Selected files carry absolute server URIs; restored queue mentions may carry inline file data.
  const mentions: PromptRequestFile[] = (input.references ?? []).flatMap((reference) =>
    reference.type !== "file" || reference.url === undefined
      ? []
      : [
          {
            uri: reference.url,
            name: getFilename(reference.path),
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
