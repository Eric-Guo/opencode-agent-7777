import { batch, createRoot } from "solid-js"
import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import { createModelsController, findModel, modelOptions, type ModelKey, type ModelOption } from "./models"
import type { ProviderCatalog } from "@/providers/catalog/client-compact"
import { readModelSelection, writeModelSelection } from "@/runtime/persistence/storage-compact"
import { setState, state } from "@/runtime/server/session-store-compact"

export type ModelLoadStatus = "loading" | "ready" | "failed"

export type ModelSelectorState = {
  current: () => ModelOption | undefined
  list: () => ModelOption[]
  set: (model: ModelKey | undefined, options?: { recent?: boolean }) => void
  visible: (model: ModelKey) => boolean
  setVisibility: (model: ModelKey, visible: boolean) => void
  setProviderVisibility: (providerID: string, visible: boolean) => void
}

const models = createRoot(() => createModelsController(() => state.models))

export function resolveSelectedModel<T extends ModelKey>(
  options: T[],
  defaults: ProviderCatalog["default"],
  stored: ModelKey | undefined,
  configured: ModelKey | undefined,
) {
  const storedOption = findModel(options, stored)
  if (storedOption) return { providerID: storedOption.providerID, modelID: storedOption.modelID }

  const configuredDefaultOption = findModel(options, configured)
  if (configuredDefaultOption) {
    return { providerID: configuredDefaultOption.providerID, modelID: configuredDefaultOption.modelID }
  }

  for (const option of options) {
    const modelID = defaults[option.providerID]
    if (!modelID) continue
    const defaultOption = findModel(options, { providerID: option.providerID, modelID })
    if (defaultOption) return { providerID: defaultOption.providerID, modelID: defaultOption.modelID }
  }

  const first = options[0]
  if (!first) return
  return { providerID: first.providerID, modelID: first.modelID }
}

export function syncModelSelection(catalog: ProviderCatalog) {
  const options = modelOptions(catalog)
  const selected = resolveSelectedModel(
    options,
    catalog.default,
    readModelSelection(),
    DEFAULT_MODEL_CONFIG.defaultSelection ?? undefined,
  )
  batch(() => {
    setState("models", options)
    setState("selectedModel", selected)
    models.compact()
  })
  if (selected) writeModelSelection(selected)
}

// Active-session selection delegates visibility and recency to the models controller.
export function createModelSelection(): ModelSelectorState {
  return {
    current: () => models.find(state.selectedModel),
    list: models.list,
    set(model, options) {
      if (model && !models.find(model)) return
      batch(() => {
        setState("selectedModel", model ? { ...model } : undefined)
        writeModelSelection(model)
        if (!model) return
        models.setVisibility(model, true)
        if (options?.recent) models.recent.push(model)
      })
    },
    visible: models.visible,
    setVisibility: models.setVisibility,
    setProviderVisibility: models.setProviderVisibility,
  }
}
