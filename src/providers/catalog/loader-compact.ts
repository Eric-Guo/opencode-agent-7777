import type { SessionInfo as Session } from "@opencode-ai/client/promise"
import { selectProviderCatalog } from "@/providers/catalog/client-compact"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { sessionDirectory } from "@/session/directory"

// Imperative catalog loader for the compact store, not the main app's reactive useProviders hook.

export { popularProviders } from "@/providers/catalog/order"

export async function loadProviderCatalog(client: OpencodeClient, session: Session) {
  const location = { directory: sessionDirectory(session) }
  const defaultModel = await client.model.default({ location })
  const [providers, models] = await Promise.all([client.provider.list({ location }), client.model.list({ location })])
  return selectProviderCatalog({ providers: providers.data, models: models.data, defaultModel: defaultModel.data })
}
