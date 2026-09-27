import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import type { ModelSelection } from "@/runtime/persistence/storage-compact"
import { storageGet, storageSet } from "@/runtime/persistence/storage"

// Model preference formats belong to the runtime; catalog and visibility operations stay in providers/models.
export type Visibility = "show" | "hide"
type ProviderVisibility = {
  providerID: string
  visibility: Visibility
}

export type ModelConfig = {
  user: Array<ModelSelection & { visibility: Visibility }>
  disabledProviders: string[]
  popularProviders: ProviderVisibility[]
  recent: ModelSelection[]
  variant?: Record<string, string>
}

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
    const parsed = JSON.parse(value) as Partial<ModelConfig>
    return {
      user: Array.isArray(parsed.user) ? parsed.user.filter(isConfiguredVisibility) : [],
      disabledProviders: Array.isArray(parsed.disabledProviders)
        ? parsed.disabledProviders.filter((item): item is string => typeof item === "string")
        : [...DEFAULT_MODEL_CONFIG.disabledProviders],
      popularProviders: Array.isArray(parsed.popularProviders)
        ? parsed.popularProviders.filter(isProviderVisibility)
        : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter(isModelSelection) : [],
      ...(parsed.variant && typeof parsed.variant === "object" && !Array.isArray(parsed.variant)
        ? {
            variant: Object.fromEntries(
              Object.entries(parsed.variant).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
            ),
          }
        : {}),
    }
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

function isModelSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<ModelSelection>
  return typeof item.providerID === "string" && typeof item.modelID === "string"
}

function isConfiguredVisibility(value: unknown): value is ModelSelection & { visibility: Visibility } {
  if (!isModelSelection(value)) return false
  const item = value as { visibility?: unknown }
  return item.visibility === "show" || item.visibility === "hide"
}

function isProviderVisibility(value: unknown): value is ProviderVisibility {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<ProviderVisibility>
  return typeof item.providerID === "string" && (item.visibility === "show" || item.visibility === "hide")
}
