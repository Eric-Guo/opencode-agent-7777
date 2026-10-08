import type { ModelCost, ModelInfo, ProviderInfo } from "@opencode/client/promise"

// Keep public client capabilities intact; only picker-specific views need adaptation.
export type Model = Pick<ModelInfo, "id" | "providerID" | "name" | "family" | "limit" | "status" | "capabilities"> & {
  api: {
    id: ModelInfo["modelID"]
  }
  cost: Omit<ModelCost, "tier">
  variants?: Record<string, NonNullable<ModelInfo["variants"][number]["settings"]>>
}

export type Provider = Pick<ProviderInfo, "id" | "canonical" | "integrationID" | "name"> & {
  models: Record<string, Model>
}

export type ProviderListResponse = {
  all: Map<string, Provider>
  default: Record<string, string>
  connected: string[]
}
