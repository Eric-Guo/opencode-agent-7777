import type { ProviderListResponse } from "@/runtime/server/types"
import { findModel, type ModelKey } from "./models"

function serverDefault<T extends ModelKey>(options: T[], defaults: ProviderListResponse["default"]) {
  for (const providerID of new Set(options.map((option) => option.providerID))) {
    const modelID = defaults[providerID]
    if (!modelID) continue
    const model = findModel(options, { providerID, modelID })
    if (model) return model
  }
}

export function resolveSelectedModel<T extends ModelKey>(
  options: T[],
  defaults: ProviderListResponse["default"],
  stored: ModelKey | undefined,
  configured: ModelKey | undefined,
) {
  const model =
    findModel(options, stored) ?? findModel(options, configured) ?? serverDefault(options, defaults) ?? options[0]
  // Give the mutable session store its own key, including when a legacy API ID resolved to a catalog ID.
  if (model) return { providerID: model.providerID, modelID: model.modelID }
}
