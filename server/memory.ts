import { Schema } from "effect"

const Source = Schema.Union([
  Schema.Struct({
    scope: Schema.Literal("conversation"),
    conversation_public_id: Schema.optional(Schema.NonEmptyString),
  }),
  Schema.Struct({ scope: Schema.Literal("speaker"), speaker_public_id: Schema.optional(Schema.NonEmptyString) }),
  Schema.Struct({ scope: Schema.Literals(["workspace", "agent", "user"]) }),
  Schema.Struct({ collection_public_id: Schema.NonEmptyString }),
])

const Binding = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9_-]{0,31}$/)),
  source: Source,
  access: Schema.Literals(["read", "read_write"]),
})

export const MemorySelection = Schema.Struct({ bindings: Schema.Array(Binding).check(Schema.isMaxLength(16)) })

export const MemoryChange = Schema.Struct({ selection: Schema.NullOr(MemorySelection) })

export const MemoryConfiguration = Schema.NullOr(
  Schema.Struct({ ...MemorySelection.fields, automatic: Schema.optional(Schema.Boolean) }),
)
