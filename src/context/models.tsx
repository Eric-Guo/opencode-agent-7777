import type { Session } from "@opencode-ai/sdk"
import { createMemo, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { translateSync } from "@/context/language"
import { writeModelSelection, type ModelSelection } from "@/context/local"
import type { OpencodeClient } from "@/context/sdk"
import { setState, state } from "@/context/sync"
import { popularProviders } from "@/hooks/use-providers"
import { findModel, resolveSelectedModel } from "@/pages/session/session-model-helpers"
import { readableError } from "@/utils/server-errors"

export { findModel } from "@/pages/session/session-model-helpers"

export type ModelLoadStatus = "loading" | "ready" | "failed"

type ProviderListData = NonNullable<Awaited<ReturnType<OpencodeClient["provider"]["list"]>>["data"]>
type ProviderItem = ProviderListData["all"][number]
type ProviderModel = ProviderItem["models"][string]
type Visibility = "show" | "hide"
type ProviderVisibility = {
  providerID: string
  visibility: Visibility
}

type ModelConfig = {
  user: Array<ModelSelection & { visibility: Visibility }>
  popularProviders: ProviderVisibility[]
  recent: ModelSelection[]
}

export type ModelOption = Omit<ProviderModel, "id" | "name" | "provider"> &
  ModelSelection & {
    provider: ProviderItem
    latest: boolean
    name: string
    id: string
    cost?: { input: number }
    variants?: Record<string, unknown>
    providerName: string
    modelName: string
  }

export type ModelKey = ModelSelection

export type ModelSelectorState = {
  current: () => ModelOption | undefined
  list: () => ModelOption[]
  set: (model: ModelKey | undefined, options?: { recent?: boolean }) => void
  visible: (model: ModelKey) => boolean
  setVisibility: (model: ModelKey, visible: boolean) => void
  setProviderVisibility: (providerID: string, visible: boolean) => void
}

const MODEL_CONFIG_KEY = "opencode.7777.model.config"
const RECENT_LIMIT = 5

function readModelConfig(): ModelConfig {
  if (typeof localStorage !== "object") return { user: [], popularProviders: [], recent: [] }
  try {
    const value = localStorage.getItem(MODEL_CONFIG_KEY)
    if (!value) return { user: [], popularProviders: [], recent: [] }
    const parsed = JSON.parse(value) as Partial<ModelConfig>
    return {
      user: Array.isArray(parsed.user) ? parsed.user.filter(isConfiguredVisibility) : [],
      popularProviders: Array.isArray(parsed.popularProviders)
        ? parsed.popularProviders.filter(isProviderVisibility)
        : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter(isModelSelection) : [],
    }
  } catch {
    return { user: [], popularProviders: [], recent: [] }
  }
}

function writeModelConfig(value: ModelConfig) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify(value))
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

function sameModel(a: ModelSelection | undefined, b: ModelSelection | undefined) {
  return !!a && !!b && a.providerID === b.providerID && a.modelID === b.modelID
}

function modelKey(model: ModelSelection) {
  return `${model.providerID}:${model.modelID}`
}

const [modelConfig, setModelConfig] = createStore<ModelConfig>(readModelConfig())
const popularProviderSet = new Set<string>(popularProviders)
const visibilityMaps = createRoot(() => ({
  model: createMemo(() => {
    const map = new Map<string, Visibility>()
    for (const item of modelConfig.user) map.set(modelKey(item), item.visibility)
    return map
  }),
  provider: createMemo(() => {
    const map = new Map<string, Visibility>()
    for (const item of modelConfig.popularProviders) map.set(item.providerID, item.visibility)
    return map
  }),
}))

function persistConfig(next: ModelConfig = modelConfig) {
  writeModelConfig({
    user: [...next.user],
    popularProviders: [...next.popularProviders],
    recent: [...next.recent],
  })
}

function visibilityMap() {
  return visibilityMaps.model()
}

function providerVisibilityMap() {
  return visibilityMaps.provider()
}

function isPopularProvider(providerID: string) {
  return popularProviderSet.has(providerID)
}

function removeModelVisibility(model: ModelSelection) {
  const nextUser = modelConfig.user.filter((item) => !sameModel(item, model))
  if (nextUser.length === modelConfig.user.length) return
  setModelConfig("user", nextUser)
  persistConfig({ ...modelConfig, user: nextUser })
}

function updateVisibility(model: ModelSelection, visibility: Visibility) {
  if (isPopularProvider(model.providerID)) {
    const providerVisibility = providerVisibilityMap().get(model.providerID) ?? "show"
    if (providerVisibility === visibility) {
      removeModelVisibility(model)
      return
    }
  }

  const index = modelConfig.user.findIndex((item) => sameModel(item, model))
  if (index >= 0) setModelConfig("user", index, { ...model, visibility })
  else setModelConfig("user", modelConfig.user.length, { ...model, visibility })
  persistConfig()
}

function updateProviderVisibility(providerID: string, visibility: Visibility) {
  const providerModels = state.models.filter((item) => item.providerID === providerID)
  if (providerModels.length === 0) return

  const nextUser = modelConfig.user.filter((item) => item.providerID !== providerID)

  if (isPopularProvider(providerID)) {
    const index = modelConfig.popularProviders.findIndex((item) => item.providerID === providerID)
    const nextPopularProviders = [...modelConfig.popularProviders]
    if (index >= 0) nextPopularProviders[index] = { providerID, visibility }
    else nextPopularProviders.push({ providerID, visibility })

    setModelConfig({ ...modelConfig, user: nextUser, popularProviders: nextPopularProviders })
    persistConfig({ ...modelConfig, user: nextUser, popularProviders: nextPopularProviders })
    return
  }

  const nextProviderModels = providerModels.map((item) => ({
    providerID,
    modelID: item.id,
    visibility,
  }))
  const nextUserWithProvider = [...nextUser, ...nextProviderModels]
  setModelConfig("user", nextUserWithProvider)
  persistConfig({ ...modelConfig, user: nextUserWithProvider })
}

function compactPopularProviderConfig(options: ModelOption[]) {
  const modelsByProvider = new Map<string, ModelOption[]>()
  for (const item of options) {
    if (!isPopularProvider(item.providerID)) continue
    const providerModels = modelsByProvider.get(item.providerID)
    if (providerModels) providerModels.push(item)
    else modelsByProvider.set(item.providerID, [item])
  }

  let nextUser = [...modelConfig.user]
  let nextPopularProviders = [...modelConfig.popularProviders]
  let changed = false

  for (const [providerID, models] of modelsByProvider) {
    const providerConfig = nextPopularProviders.find((item) => item.providerID === providerID)
    if (providerConfig) {
      const filtered = nextUser.filter(
        (item) => item.providerID !== providerID || item.visibility !== providerConfig.visibility,
      )
      changed = changed || filtered.length !== nextUser.length
      nextUser = filtered
      continue
    }

    const modelVisibilities = new Map(
      nextUser.filter((item) => item.providerID === providerID).map((item) => [item.modelID, item.visibility]),
    )
    if (modelVisibilities.size !== models.length) continue

    const visibility = modelVisibilities.get(models[0].id)
    if (!visibility || !models.every((item) => modelVisibilities.get(item.id) === visibility)) continue

    nextPopularProviders = [...nextPopularProviders, { providerID, visibility }]
    nextUser = nextUser.filter((item) => item.providerID !== providerID)
    changed = true
  }

  if (!changed) return
  setModelConfig({ ...modelConfig, user: nextUser, popularProviders: nextPopularProviders })
  persistConfig({ ...modelConfig, user: nextUser, popularProviders: nextPopularProviders })
}

function pushRecent(model: ModelSelection) {
  const unique = [model, ...modelConfig.recent.filter((item) => !sameModel(item, model))]
  if (unique.length > RECENT_LIMIT) unique.pop()
  setModelConfig("recent", unique)
  persistConfig({ ...modelConfig, recent: unique })
}

export function visibleModel(model: ModelSelection) {
  const modelVisibility = visibilityMap().get(modelKey(model))
  if (modelVisibility) return modelVisibility !== "hide"

  const providerVisibility = isPopularProvider(model.providerID)
    ? providerVisibilityMap().get(model.providerID)
    : undefined
  return providerVisibility !== "hide"
}

export const modelSelector: ModelSelectorState = {
  current() {
    return findModel(state.models, state.selectedModel)
  },
  list() {
    return state.models
  },
  set(model, options) {
    if (model && !findModel(state.models, model)) return
    setState("selectedModel", model)
    writeModelSelection(model)
    if (model) {
      updateVisibility(model, "show")
      if (options?.recent) pushRecent(model)
    }
  },
  visible(model) {
    return visibleModel(model)
  },
  setVisibility(model, visible) {
    if (!findModel(state.models, model)) return
    updateVisibility(model, visible ? "show" : "hide")
  },
  setProviderVisibility(providerID, visible) {
    updateProviderVisibility(providerID, visible ? "show" : "hide")
  },
}

export function refreshModels(activeClient: OpencodeClient | undefined, session: Session | undefined) {
  if (!activeClient || !session) return Promise.resolve()

  setState("modelStatus", "loading")
  return activeClient.provider
    .list({
      query: { directory: session.directory },
    })
    .then((result) => {
      const data = result.data
      if (!data) throw new Error(translateSync("error.modelListEmpty"))
      const connected = new Set(data.connected)
      const options = data.all
        .filter((provider) => connected.has(provider.id))
        .flatMap((provider) =>
          Object.values(provider.models)
            .filter((model) => model.status !== "deprecated")
            .map((model) => ({
              ...model,
              id: model.id,
              name: model.name.replace("(latest)", "").trim(),
              provider,
              latest: model.name.includes("(latest)"),
              providerID: provider.id,
              modelID: model.id,
              providerName: provider.name,
              modelName: model.name.replace("(latest)", "").trim(),
            }) satisfies ModelOption),
        )
        .sort((a, b) => {
          const provider = a.providerName.localeCompare(b.providerName)
          if (provider !== 0) return provider
          return a.modelName.localeCompare(b.modelName)
        })

      const selected = resolveSelectedModel(options, data.default)
      setState("models", options)
      setState("selectedModel", selected)
      setState("modelStatus", "ready")
      compactPopularProviderConfig(options)
      if (selected) writeModelSelection(selected)
    })
    .catch((error) => {
      setState("modelStatus", "failed")
      setState("error", readableError(error))
    })
}

export function selectModel(model: ModelSelection) {
  modelSelector.set(model, { recent: true })
}
