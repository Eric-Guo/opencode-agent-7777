import type { ProviderListResponse, Session } from "@opencode-ai/sdk"
import {
  readModelSelection,
  writeModelSelection,
  type ModelSelection,
} from "@/context/local"
import type { OpencodeClient } from "@/context/sdk"
import { setState, state } from "@/context/sync"
import { readableError } from "@/pages/session/helpers"

export type ModelLoadStatus = "loading" | "ready" | "failed"
export type ModelOption = ModelSelection & {
  providerName: string
  modelName: string
}

function sameModel(a: ModelSelection | undefined, b: ModelSelection | undefined) {
  return !!a && !!b && a.providerID === b.providerID && a.modelID === b.modelID
}

export function findModel(options: ModelOption[], model: ModelSelection | undefined) {
  if (!model) return
  return options.find((option) => sameModel(option, model))
}

function resolveSelectedModel(options: ModelOption[], defaults: ProviderListResponse["default"]) {
  const stored = readModelSelection()
  const storedOption = findModel(options, stored)
  if (storedOption) return { providerID: storedOption.providerID, modelID: storedOption.modelID }

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

export function refreshModels(activeClient: OpencodeClient | undefined, session: Session | undefined) {
  if (!activeClient || !session) return Promise.resolve()

  setState("modelStatus", "loading")
  return activeClient.provider
    .list({
      query: { directory: session.directory },
    })
    .then((result) => {
      const data = result.data
      if (!data) throw new Error("Model list response was empty")
      const connected = new Set(data.connected)
      const options = data.all
        .filter((provider) => connected.has(provider.id))
        .flatMap((provider) =>
          Object.values(provider.models)
            .filter((model) => model.status !== "deprecated")
            .map((model) => ({
              providerID: provider.id,
              modelID: model.id,
              providerName: provider.name,
              modelName: model.name.replace("(latest)", "").trim(),
            })),
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
  if (!findModel(state.models, model)) return
  setState("selectedModel", model)
  writeModelSelection(model)
}
