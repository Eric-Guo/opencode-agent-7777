import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { normalizeProviderList } from "@/runtime/server/global-sync/utils"

export { popularProviders } from "./order"

// Directory catalog reads do not own active-session state or model selection.
export async function loadProviderCatalog(client: Pick<OpencodeClient, "model" | "provider">, directory: string) {
  const location = { directory }
  const defaultModel = await client.model.default({ location })
  const [providers, models] = await Promise.all([client.provider.list({ location }), client.model.list({ location })])
  return {
    ...normalizeProviderList(providers.data, models.data),
    // Keep the server's configured default ahead of the first available model.
    default: defaultModel.data ? { [defaultModel.data.providerID]: defaultModel.data.id } : {},
  }
}
