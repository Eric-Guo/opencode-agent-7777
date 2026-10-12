import { Effect, Option, Schema } from "effect"
import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import { Persistence } from "@/runtime/persistence/schema"
import { storageGet, storageSet } from "@/runtime/persistence/storage"

// Model preference formats belong to the runtime; catalog and visibility operations stay in providers/models.
const Visibility = Schema.Literals(["show", "hide"])
export type Visibility = typeof Visibility.Type

export const ModelSelection = Persistence.struct({ providerID: Schema.String, modelID: Schema.String })
export type ModelSelection = typeof ModelSelection.Type

// Keep the main app's ModelState boundary, with the compact provider defaults and legacy entry fields.
export const ModelState = Persistence.struct({
  user: Persistence.array(Persistence.legacy({ ...ModelSelection.fields, visibility: Visibility })),
  disabledProviders: Persistence.array(Schema.String, () => [...DEFAULT_MODEL_CONFIG.disabledProviders]),
  popularProviders: Persistence.array(Persistence.legacy({ providerID: Schema.String, visibility: Visibility })),
  recent: Persistence.array(Persistence.legacy(ModelSelection.fields)),
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
