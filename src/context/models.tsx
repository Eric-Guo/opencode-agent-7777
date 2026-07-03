import type { Session } from "@opencode-ai/sdk"
import { translateSync } from "@/context/language"
import { writeModelSelection, type ModelSelection } from "@/context/local"
import type { OpencodeClient } from "@/context/sdk"
import { setState, state } from "@/context/sync"
import { findModel, resolveSelectedModel } from "@/pages/session/session-model-helpers"
import { readableError } from "@/utils/server-errors"

export { findModel } from "@/pages/session/session-model-helpers"

export type ModelLoadStatus = "loading" | "ready" | "failed"
export type ModelOption = ModelSelection & {
  providerName: string
  modelName: string
}

export function refreshModels(activeClient: OpencodeClient | undefined, session: Session | undefined) {
  if (!activeClient || !session) return Promise.resolve()

  setState("modelStatus", "loading")
  return activeClient.provider
    .list({
      query: { directory: session.directory },
    })
    .then((result) => {
      const data = result.data
      if (!data) throw new Error(translateSync("error.modelListEmpty"))
      const connected = new Set(data.connected)
      const options = data.all
        .filter((provider) => connected.has(provider.id))
        .flatMap((provider) =>
          Object.values(provider.models)
            .filter((model) => model.status !== "deprecated")
            .map((model) => ({
              providerID: provider.id,
              modelID: model.id,
              providerName: provider.name,
              modelName: model.name.replace("(latest)", "").trim(),
            })),
        )
        .sort((a, b) => {
          const provider = a.providerName.localeCompare(b.providerName)
          if (provider !== 0) return provider
          return a.modelName.localeCompare(b.modelName)
        })

      const selected = resolveSelectedModel(options, data.default)
      setState("models", options)
      setState("selectedModel", selected)
      setState("modelStatus", "ready")
      if (selected) writeModelSelection(selected)
    })
    .catch((error) => {
      setState("modelStatus", "failed")
      setState("error", readableError(error))
    })
}

export function selectModel(model: ModelSelection) {
  if (!findModel(state.models, model)) return
  setState("selectedModel", model)
  writeModelSelection(model)
}
