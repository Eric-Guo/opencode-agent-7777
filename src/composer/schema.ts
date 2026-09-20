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

// History uses the compact editor's text and inline attachment parts.
export const PromptHistoryEntry = Persistence.struct({
  prompt: Schema.mutable(
    Schema.Array(
      Schema.Union([
        Persistence.struct({
          type: Schema.Literal("text"),
          content: Schema.String,
          start: Schema.Number,
          end: Schema.Number,
        }),
        Persistence.struct({
          type: Schema.Literal("image"),
          id: Schema.String,
          filename: Schema.String,
          sourcePath: Persistence.optional(Schema.String),
          mime: Schema.String,
          blob: Persistence.struct({ id: Schema.String, url: Schema.String.check(Schema.isPattern(/^data:/)) }),
        }),
      ]),
    ),
  ),
})
export type PromptHistoryEntry = typeof PromptHistoryEntry.Type

export const PromptHistoryState = Persistence.struct({ entries: Persistence.array(PromptHistoryEntry) })
