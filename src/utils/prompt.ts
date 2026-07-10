import type { Part } from "@opencode-ai/sdk"
import type { PromptAttachment } from "@/context/prompt"

export function extractPromptFromParts(parts: Part[]) {
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .filter((part) => !part.synthetic && !part.ignored)
    .reduce((best: Extract<Part, { type: "text" }> | undefined, part) => {
      if (!best) return part
      return part.text.length > best.text.length ? part : best
    }, undefined)

  const attachments: PromptAttachment[] = parts
    .filter((part): part is Extract<Part, { type: "file" }> => part.type === "file")
    .filter((part) => !part.source)
    .map((part) => ({
      id: part.id,
      filename: part.filename ?? "attachment",
      mime: part.mime,
      url: part.url,
    }))

  return {
    text: text?.text ?? "",
    attachments,
  }
}
