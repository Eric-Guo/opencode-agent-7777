import config from "@/context/default-model-config.json"

export type Visibility = "show" | "hide"

export type DefaultModelSelection = {
  providerID: string
  modelID: string
}

type DefaultModelConfig = {
  // Set true for developer/debug builds that should expose the Manage models dialog in the selector UI.
  manageModels: boolean
  // Preferred model selected for users without a saved localStorage model selection.
  defaultSelection: DefaultModelSelection | null
  // Models from these providers are hidden by default. New models stay hidden until the provider is removed here.
  disabledProviders: string[]
  // Provider-level defaults for the providers shown first in the model manager.
  popularProviders: Array<{ providerID: string; visibility: Visibility }>
  // Per-model overrides. Missing models show by default unless their provider is disabled above or hidden here.
  user: Array<{ providerID: string; modelID: string; visibility: Visibility }>
}

export const DEFAULT_MODEL_CONFIG = config as DefaultModelConfig
