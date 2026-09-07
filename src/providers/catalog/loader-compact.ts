import type { SessionInfo as Session } from "@opencode-ai/client/promise"
import { selectProviderCatalog } from "@/providers/catalog/client-compact"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { sessionDirectory } from "@/session/directory"
import { syncModelSelection } from "@/providers/models/selection"
import { translateSync } from "@/runtime/i18n/language"
import { setState } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"

// Imperative catalog loading and status for the single-session app.

export { popularProviders } from "@/providers/catalog/order"

export async function loadProviderCatalog(client: OpencodeClient, session: Session) {
  const location = { directory: sessionDirectory(session) }
  const defaultModel = await client.model.default({ location })
  const [providers, models] = await Promise.all([client.provider.list({ location }), client.model.list({ location })])
  return selectProviderCatalog({ providers: providers.data, models: models.data, defaultModel: defaultModel.data })
}

export function refreshModels(activeClient: OpencodeClient | undefined, session: Session | undefined) {
  if (!activeClient || !session) return Promise.resolve()

  setState("modelStatus", "loading")
  return loadProviderCatalog(activeClient, session)
    .then((catalog) => {
      if (!catalog) throw new Error(translateSync("error.modelListEmpty"))
      syncModelSelection(catalog)
      setState("modelStatus", "ready")
    })
    .catch((error) => {
      setState("modelStatus", "failed")
      setState("error", readableError(error))
    })
}
