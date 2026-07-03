import type { Session } from "@opencode-ai/sdk"
import { createStore } from "solid-js/store"
import { translateSync } from "@/context/language"
import { writeModelSelection, type ModelSelection } from "@/context/local"
import type { OpencodeClient } from "@/context/sdk"
import { setState, state } from "@/context/sync"
import { findModel, resolveSelectedModel } from "@/pages/session/session-model-helpers"
import { readableError } from "@/utils/server-errors"

export { findModel } from "@/pages/session/session-model-helpers"

export type ModelLoadStatus = "loading" | "ready" | "failed"

type ProviderListData = NonNullable<Awaited<ReturnType<OpencodeClient["provider"]["list"]>>["data"]>
type ProviderItem = ProviderListData["all"][number]
type ProviderModel = ProviderItem["models"][string]
type Visibility = "show" | "hide"

type ModelConfig = {
  user: Array<ModelSelection & { visibility: Visibility }>
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
}

const MODEL_CONFIG_KEY = "opencode.7777.model.config"
const RECENT_LIMIT = 5

function readModelConfig(): ModelConfig {
  if (typeof localStorage !== "object") return { user: [], recent: [] }
  try {
    const value = localStorage.getItem(MODEL_CONFIG_KEY)
    if (!value) return { user: [], recent: [] }
    const parsed = JSON.parse(value) as Partial<ModelConfig>
    return {
      user: Array.isArray(parsed.user) ? parsed.user.filter(isConfiguredVisibility) : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter(isModelSelection) : [],
    }
  } catch {
    return { user: [], recent: [] }
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

function sameModel(a: ModelSelection | undefined, b: ModelSelection | undefined) {
  return !!a && !!b && a.providerID === b.providerID && a.modelID === b.modelID
}

function modelKey(model: ModelSelection) {
  return `${model.providerID}:${model.modelID}`
}

const [modelConfig, setModelConfig] = createStore<ModelConfig>(readModelConfig())

function persistConfig(next: ModelConfig = modelConfig) {
  writeModelConfig({
    user: [...next.user],
    recent: [...next.recent],
  })
}

function visibilityMap() {
  const map = new Map<string, Visibility>()
  for (const item of modelConfig.user) map.set(modelKey(item), item.visibility)
  return map
}

function updateVisibility(model: ModelSelection, visibility: Visibility) {
  const index = modelConfig.user.findIndex((item) => sameModel(item, model))
  if (index >= 0) setModelConfig("user", index, { ...model, visibility })
  else setModelConfig("user", modelConfig.user.length, { ...model, visibility })
  persistConfig()
}

function pushRecent(model: ModelSelection) {
  const unique = [model, ...modelConfig.recent.filter((item) => !sameModel(item, model))]
  if (unique.length > RECENT_LIMIT) unique.pop()
  setModelConfig("recent", unique)
  persistConfig({ ...modelConfig, recent: unique })
}

export function visibleModel(model: ModelSelection) {
  return visibilityMap().get(modelKey(model)) !== "hide"
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
