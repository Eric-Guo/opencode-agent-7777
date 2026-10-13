import { Effect, Option, Schema } from "effect"
import { MODEL_SELECTION_KEY, SESSION_MODEL_SELECTION_KEY } from "@/constants/session"
import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import { Persistence } from "@/runtime/persistence/schema"
import { storageGet, storageSet } from "@/runtime/persistence/storage"

// Model preference formats belong to the runtime; catalog and visibility operations stay in providers/models.
const Visibility = Schema.Literals(["show", "hide"])
export type Visibility = typeof Visibility.Type

export const ModelSelection = Persistence.struct({ providerID: Schema.String, modelID: Schema.String })
export type ModelSelection = typeof ModelSelection.Type

// Per-session choices retain legacy fields; null explicitly selects Default instead of a preferred variant.
const StoredModelSelection = Persistence.legacy(ModelSelection.fields)
export const SessionModelSelection = Persistence.legacy({
  model: StoredModelSelection,
  variant: Schema.NullOr(Schema.String),
})
export type SessionModelSelection = typeof SessionModelSelection.Type

const SessionModelSelections = Schema.Record(
  Schema.String,
  Schema.mutableKey(
    Schema.UndefinedOr(SessionModelSelection).pipe(Schema.catchDecoding(() => Effect.succeed(Option.none()))),
  ),
)
export type SessionModelSelections = typeof SessionModelSelections.Type

const decodeModelSelection = Schema.decodeUnknownOption(Schema.fromJsonString(ModelSelection))
const decodeSessionModelSelections = Schema.decodeUnknownOption(Schema.fromJsonString(SessionModelSelections))

export function readModelSelection(): ModelSelection | undefined {
  return Option.getOrUndefined(decodeModelSelection(storageGet(MODEL_SELECTION_KEY)))
}

export function writeModelSelection(model: ModelSelection | undefined) {
  if (!model) return
  storageSet(MODEL_SELECTION_KEY, JSON.stringify(model))
}

export function readSessionModelSelections(): SessionModelSelections {
  return Option.getOrElse(decodeSessionModelSelections(storageGet(SESSION_MODEL_SELECTION_KEY)), () => ({}))
}

export function writeSessionModelSelections(value: SessionModelSelections) {
  storageSet(SESSION_MODEL_SELECTION_KEY, JSON.stringify(value))
}

// Keep the main app's ModelState boundary, with the compact provider defaults and legacy entry fields.
export const ModelState = Persistence.struct({
  user: Persistence.array(Persistence.legacy({ ...ModelSelection.fields, visibility: Visibility })),
  disabledProviders: Persistence.array(Schema.String, () => [...DEFAULT_MODEL_CONFIG.disabledProviders]),
  popularProviders: Persistence.array(Persistence.legacy({ providerID: Schema.String, visibility: Visibility })),
  recent: Persistence.array(StoredModelSelection),
  variant: Persistence.optional(
    Schema.Record(
      Schema.String,
      Schema.mutableKey(Schema.String.pipe(Schema.catchDecoding(() => Effect.succeed(Option.none())))),
    ),
  ),
})
export type ModelConfig = typeof ModelState.Type

const decodeModelConfig = Schema.decodeUnknownSync(ModelState)

const MODEL_CONFIG_KEY = "opencode.7777.model.config"

function defaultModelConfig(): ModelConfig {
  return {
    user: DEFAULT_MODEL_CONFIG.user.map((item) => ({ ...item })),
    disabledProviders: [...DEFAULT_MODEL_CONFIG.disabledProviders],
    popularProviders: DEFAULT_MODEL_CONFIG.popularProviders.map((item) => ({ ...item })),
    recent: [],
  }
}

export function readModelConfig(): ModelConfig {
  try {
    const value = storageGet(MODEL_CONFIG_KEY)
    if (!value) return defaultModelConfig()
    const parsed: unknown = JSON.parse(value)
    if (parsed === null) return defaultModelConfig()
    // Earlier readers treated every other JSON primitive/array as an incomplete config.
    return decodeModelConfig(typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {})
  } catch {
    return defaultModelConfig()
  }
}

export function writeModelConfig(value: ModelConfig) {
  try {
    storageSet(MODEL_CONFIG_KEY, JSON.stringify(value))
  } catch {
    return
  }
}
