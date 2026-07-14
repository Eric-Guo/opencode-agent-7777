import type { ModelInfo, ProviderV2Info } from "@opencode-ai/client"

export type ProviderItem = ProviderV2Info & { models: Record<string, ModelInfo> }
export type ProviderModel = ModelInfo
export type ProviderCatalogData = {
  providers: ProviderV2Info[]
  models: ModelInfo[]
  defaultModel: ModelInfo | null
}

export type ProviderCatalog = {
  all: ProviderItem[]
  connected: ProviderItem[]
  default: Record<string, string>
}

export function selectProviderCatalog(data: ProviderCatalogData): ProviderCatalog {
  const all = data.providers.map((provider) => ({
    ...provider,
    models: Object.fromEntries(
      data.models.filter((model) => model.providerID === provider.id).map((model) => [model.modelID, model]),
    ),
  }))
  return {
    all,
    connected: all.filter((provider) => !provider.disabled && Object.keys(provider.models).length > 0),
    default: data.defaultModel ? { [data.defaultModel.providerID]: data.defaultModel.modelID } : {},
  }
}
