import type { OpencodeClient } from "@/context/sdk"

export type ProviderCatalogData = NonNullable<Awaited<ReturnType<OpencodeClient["provider"]["list"]>>["data"]>
export type ProviderItem = ProviderCatalogData["all"][number]
export type ProviderModel = ProviderItem["models"][string]

export type ProviderCatalog = {
  all: ProviderItem[]
  connected: ProviderItem[]
  default: ProviderCatalogData["default"]
}

export function selectProviderCatalog(data: ProviderCatalogData): ProviderCatalog {
  const connected = new Set(data.connected)
  return {
    all: data.all,
    connected: data.all.filter((provider) => connected.has(provider.id)),
    default: data.default,
  }
}
