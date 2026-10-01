import type { SessionInfo as Session } from "@opencode/client/promise"
import { batch } from "solid-js"
import { reconcile } from "solid-js/store"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { sessionDirectory } from "@/session/directory"
import { syncModelSelection } from "@/providers/models/selection"
import { translateSync } from "@/runtime/i18n/language"
import { currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { loadProviderCatalog } from "./providers"

// Active-session refresh admission and model selection stay local to the embedded app.

let refreshVersion = 0

export function refreshModels(activeClient: OpencodeClient | undefined, session: Session | undefined) {
  const runtime = currentRuntime()
  if (!activeClient || !session || !runtime || runtime.api !== activeClient) return Promise.resolve()
  const version = ++refreshVersion
  const current = () => version === refreshVersion && currentRuntime() === runtime && state.session?.id === session.id
  const location = { directory: sessionDirectory(session) }
  setState("modelStatus", "loading")
  // Agent defaults are optional; an unavailable agent catalog must not disable the model picker.
  return Promise.all([
    loadProviderCatalog(activeClient, runtime.data, location.directory, runtime.signal),
    runtime.data.location.agent
      .sync(location)
      .then(() => runtime.data.location.agent.list(location))
      .catch(() => undefined),
  ])
    .then(([catalog, agents]) => {
      if (!current()) return
      if (!catalog) throw new Error(translateSync("error.modelListEmpty"))
      batch(() => {
        setState(
          "agentModels",
          reconcile(
            Object.fromEntries(
              (agents ?? []).flatMap((agent) =>
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
