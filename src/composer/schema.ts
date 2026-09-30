import { Schema } from "effect"
import { Skill } from "@opencode/schema/skill"
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

// File mentions persist as overlay ranges; url retains inline data or an absolute server file URI.
const PromptFileReference = Persistence.struct({
  type: Schema.Literal("file"),
  path: Schema.String,
  content: Schema.String,
  start: Schema.Number,
  end: Schema.Number,
  url: Persistence.optional(Schema.String),
})
export const PromptSkillReference = Persistence.struct({
  type: Schema.Literal("skill"),
  id: Skill.ID,
  name: Skill.Name,
  content: Schema.String,
  start: Schema.Number,
  end: Schema.Number,
})
const PromptAgentReference = Persistence.struct({
  type: Schema.Literal("agent"),
  name: Schema.String,
  content: Schema.String,
  start: Schema.Number,
  end: Schema.Number,
})
export const PromptReference = Schema.Union([PromptFileReference, PromptSkillReference, PromptAgentReference])
export type PromptReference = typeof PromptReference.Type

export const PromptDraft = Persistence.struct({
  prompt: Persistence.fallback(Schema.String, () => ""),
  attachments: Persistence.array(PromptAttachment),
  references: Persistence.optional(Schema.mutable(Schema.Array(PromptReference))),
})
export type PromptDraft = typeof PromptDraft.Type

// History retains text, selected files/skills/agents, and inline attachments.
export const PromptHistoryEntry = Persistence.struct({
  prompt: Schema.mutable(
    Schema.Array(
      Schema.Union([
        PromptFileReference,
        PromptSkillReference,
        PromptAgentReference,
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
