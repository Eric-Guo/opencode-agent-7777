import type { SessionInfo as Session } from "@opencode/client/promise"
import { batch } from "solid-js"
import { reconcile } from "solid-js/store"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { sessionDirectory } from "@/session/directory"
import { syncModelSelection } from "@/providers/models/selection"
import { translateSync } from "@/runtime/i18n/language"
import { currentDirectory, currentDraft, currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { bounded } from "@/runtime/server/operation"
import { abort } from "@opencode/util/abort"
import { createLoadState, transitionLoad } from "@/runtime/server/load-machine"
import { clearReadError, reportReadError } from "@/runtime/server/read-errors"
import { loadProviderCatalog } from "./providers"

// Active-session refresh admission and model selection stay local to the embedded app.

let machine = createLoadState()
let observation: AbortController | undefined
let releaseOwner: (() => void) | undefined
const errorOwner = {}

export function refreshModels(activeClient: OpencodeClient | undefined, session: Session | undefined) {
  const runtime = currentRuntime() ?? currentDraft()
  const directory = session ? sessionDirectory(session) : currentDirectory()
  if (!activeClient || !directory || !runtime || runtime.api !== activeClient) return Promise.resolve()
  machine = transitionLoad(machine, { type: "started" })
  const attempt = machine.attempt
  abort(observation)
  const controller = new AbortController()
  observation = controller
  const signal = AbortSignal.any([runtime.signal, controller.signal])
  const retire = () => {
    if (machine.attempt !== attempt) return
    machine = transitionLoad(machine, { type: "disposed" })
    clearReadError(errorOwner)
  }
  releaseOwner?.()
  runtime.signal.addEventListener("abort", retire, { once: true })
  releaseOwner = () => runtime.signal.removeEventListener("abort", retire)
  clearReadError(errorOwner)
  const current = () =>
    machine.status === "loading" &&
    machine.attempt === attempt &&
    (currentRuntime() ?? currentDraft()) === runtime &&
    state.session?.id === session?.id
  const location = { directory }
  setState("modelStatus", "loading")
  // Agent defaults are optional; an unavailable agent catalog must not disable the model picker.
  return Promise.all([
    bounded((signal) => loadProviderCatalog(activeClient, runtime.data, location.directory, signal), { signal }),
    bounded(() => runtime.data.location.agent.sync(location).then(() => runtime.data.location.agent.list(location)), {
      signal,
    }).catch(() => undefined),
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
        machine = transitionLoad(machine, { type: "succeeded", attempt })
        setState("modelStatus", "ready")
      })
    })
    .catch((error) => {
      if (!current()) return
      machine = transitionLoad(machine, { type: "failed", attempt, error })
      setState("modelStatus", "failed")
      reportReadError(errorOwner, error, () => {
        void refreshModels(activeClient, session)
      })
    })
}
