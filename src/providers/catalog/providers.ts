import type { Data } from "@opencode/client/solid"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { normalizeProviderList } from "@/runtime/server/global-sync/utils"

export { popularProviders } from "./order"

// Directory catalog reads do not own active-session state or model selection.
export async function loadProviderCatalog(
  client: Pick<OpencodeClient, "model">,
  data: Data,
  directory: string,
  signal?: AbortSignal,
) {
  const location = { directory }
  const defaultModel = await client.model.default({ location }, { signal })
  signal?.throwIfAborted()
  await Promise.all([data.location.provider.sync(location), data.location.model.sync(location)])
  return {
    ...normalizeProviderList(data.location.provider.list(location) ?? [], data.location.model.list(location) ?? []),
    // Keep the server's configured default ahead of the first available model.
    default: defaultModel.data ? { [defaultModel.data.providerID]: defaultModel.data.id } : {},
  }
}
