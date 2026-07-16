import { writeModelSelection } from "@/context/local-storage"
import {
  findModel,
  pushRecentModel,
  updateModelVisibility,
  updateProviderVisibility,
  visibleModel,
  type ModelSelectorState,
} from "@/context/models-store"
import { setState, state } from "@/context/server-session-store"

export function createPromptModelSelection(): ModelSelectorState {
  return {
    current() {
      return findModel(state.models, state.selectedModel)
    },
    list() {
      return state.models
    },
    set(model, options) {
      if (model && !findModel(state.models, model)) return
      setState("selectedModel", model)
      writeModelSelection(model)
      if (!model) return
      updateModelVisibility(model, "show")
      if (options?.recent) pushRecentModel(model)
    },
    visible(model) {
      return visibleModel(model)
    },
    setVisibility(model, visible) {
      if (!findModel(state.models, model)) return
      updateModelVisibility(model, visible ? "show" : "hide")
    },
    setProviderVisibility(providerID, visible) {
      updateProviderVisibility(providerID, visible ? "show" : "hide")
    },
  }
}
