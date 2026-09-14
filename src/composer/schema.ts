import { Schema } from "effect"
import { Persistence } from "@/runtime/persistence/schema"

// Keep the existing single-draft storage format, including legacy attachments without a blob ID.
export const PromptAttachment = Persistence.struct({
  id: Schema.String,
  filename: Schema.String,
  mime: Schema.String,
  url: Schema.String,
  sourcePath: Persistence.optional(Schema.NonEmptyString),
  blobID: Persistence.optional(Schema.NonEmptyString),
})
export type PromptAttachment = typeof PromptAttachment.Type

export const PromptDraft = Persistence.struct({
  prompt: Persistence.fallback(Schema.String, () => ""),
  attachments: Persistence.array(PromptAttachment),
})
export type PromptDraft = typeof PromptDraft.Type
