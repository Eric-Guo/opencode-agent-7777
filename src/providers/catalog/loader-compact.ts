import type { SessionInfo as Session } from "@opencode/client/promise"
import { batch } from "solid-js"
import { reconcile } from "solid-js/store"
import { normalizeProviderList } from "@/runtime/server/global-sync/utils"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { sessionDirectory } from "@/session/directory"
import { syncModelSelection } from "@/providers/models/selection"
import { translateSync } from "@/runtime/i18n/language"
import { setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"

// Imperative catalog loading and status for the single-session app.

export { popularProviders } from "@/providers/catalog/order"

let refreshVersion = 0

export async function loadProviderCatalog(client: OpencodeClient, session: Session) {
  const location = { directory: sessionDirectory(session) }
  const defaultModel = await client.model.default({ location })
  const [providers, models] = await Promise.all([client.provider.list({ location }), client.model.list({ location })])
  return {
    ...normalizeProviderList(providers.data, models.data),
    // Keep the server's configured default ahead of the first available model.
    default: defaultModel.data ? { [defaultModel.data.providerID]: defaultModel.data.id } : {},
  }
}

export function refreshModels(activeClient: OpencodeClient | undefined, session: Session | undefined) {
  if (!activeClient || !session) return Promise.resolve()
  const version = ++refreshVersion
  const current = () => version === refreshVersion && state.session?.id === session.id
  const location = { directory: sessionDirectory(session) }
  setState("modelStatus", "loading")
  // Agent defaults are optional; an unavailable agent catalog must not disable the model picker.
  return Promise.all([
    loadProviderCatalog(activeClient, session),
    activeClient.agent.list({ location }).catch(() => undefined),
  ])
    .then(([catalog, agents]) => {
      if (!current()) return
      if (!catalog) throw new Error(translateSync("error.modelListEmpty"))
      batch(() => {
        setState(
          "agentModels",
          reconcile(
            Object.fromEntries(
              (agents?.data ?? []).flatMap((agent) =>
                agent.model
                  ? [
                      [
                        agent.id,
                        { providerID: agent.model.providerID, modelID: agent.model.id, variant: agent.model.variant },
                      ],
                    ]
                  : [],
              ),
            ),
          ),
        )
        syncModelSelection(catalog)
        setState("modelStatus", "ready")
      })
    })
    .catch((error) => {
      if (!current()) return
      setState("modelStatus", "failed")
      setState("error", readableError(error))
    })
}
