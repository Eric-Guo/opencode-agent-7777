import type { ProviderListResponse } from "@opencode-ai/sdk"
import { readModelSelection, type ModelSelection } from "@/context/local"
import type { ModelOption } from "@/context/models"

function sameModel(a: ModelSelection | undefined, b: ModelSelection | undefined) {
  return !!a && !!b && a.providerID === b.providerID && a.modelID === b.modelID
}

export function findModel(options: ModelOption[], model: ModelSelection | undefined) {
  if (!model) return
  return options.find((option) => sameModel(option, model))
}

export function resolveSelectedModel(options: ModelOption[], defaults: ProviderListResponse["default"]) {
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
