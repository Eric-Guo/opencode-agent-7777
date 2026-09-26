import type { PromptDraft } from "./schema"
import { pathToFileUrl } from "@/session/files/file-tree"

export function buildPromptRequest(
  input: Pick<PromptDraft, "prompt" | "references"> & { attachments: Readonly<PromptDraft["attachments"]> },
) {
  const offset = input.prompt.length - input.prompt.trimStart().length
  return {
    text: input.prompt.trim(),
    files: [
      ...(input.references ?? []).map((reference) => ({
        uri: reference.url ?? pathToFileUrl(reference.path),
        name: reference.path.split(/[\\/]/).at(-1),
        mention: { start: reference.start - offset, end: reference.end - offset, text: reference.content },
      })),
      ...input.attachments.map((attachment) => ({
        uri: attachment.url,
        name: attachment.sourcePath ?? attachment.filename,
      })),
    ],
  }
}
