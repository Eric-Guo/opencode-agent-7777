import { batch } from "solid-js"
import { sameModel, type ModelOption } from "@/providers/models/models"
import { localModelSelection, type ModelSelectorState } from "@/providers/models/selection"
import { selectModelChoice } from "@/providers/models/selection-machine"
import { cycleModelVariant, getConfiguredAgentVariant, resolveModelVariant } from "@/providers/models/variant"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"

const variantNames = (model: ModelOption | undefined) =>
  Object.keys(model?.variants ?? {}).filter((key) => key !== "default")

export function createPromptModelSelection(): ModelSelectorState {
  const local = localModelSelection
  const models = local.models
  const choice = () =>
    selectModelChoice({
      draft: local.draft.current(),
      durable: local.durable(),
      fallback: local.fallback.current(),
      find: models.find,
    })
  const current = () => choice()?.model
  const variants = () => variantNames(current())
  const variantFor = (model: ModelOption | undefined, selected: string | null | undefined) => {
    if (!model) return
    const agent = state.agentModels[currentLocalAgent()]
    return resolveModelVariant({
      variants: variantNames(model),
      selected,
      configured: getConfiguredAgentVariant({ agent: agent && { model: agent, variant: agent.variant }, model }),
      preferred: models.variant.get(model),
    })
  }
  const selection: ModelSelectorState = {
    current,
    list: models.list,
    recent: () =>
      models.recent.list().flatMap((key) => {
        const model = models.find(key)
        return model && models.visible(model) ? [model] : []
      }),
    cycle(direction) {
      const items = selection.recent()
      const item = current()
      if (!item || !items.length) return
      const index = items.findIndex((entry) => sameModel(entry, item))
      const next =
        index < 0 ? (direction === 1 ? 0 : items.length - 1) : (index + direction + items.length) % items.length
      // Cycling must not reorder the recent list or it would bounce between two models.
      selection.set(items[next])
    },
    set(model, options) {
      const resolved = models.find(model)
      if (model && !resolved) return
      const selected = resolved ? { providerID: resolved.providerID, modelID: resolved.modelID } : undefined
      const previous = choice()
      const variant = variantFor(resolved, sameModel(previous?.model, resolved) ? previous?.variant : undefined)
      batch(() => {
        local.draft.set(selected ? { model: selected, variant: variant ?? null } : undefined)
        local.fallback.set(selected)
        if (!selected) return
        models.setVisibility(selected, true)
        if (options?.recent) models.recent.push(selected)
      })
    },
    visible: models.visible,
    setVisibility: models.setVisibility,
    setProviderVisibility: models.setProviderVisibility,
    trackSessionCommit: local.trackSessionCommit,
    variant: {
      current() {
        const active = choice()
        return variantFor(active?.model, active?.variant)
      },
      list: variants,
      set(value) {
        const model = current()
        if (!model || (value !== undefined && value !== "default" && !variants().includes(value))) return
        batch(() => {
          local.draft.set({
            model: { providerID: model.providerID, modelID: model.modelID },
            variant: value && value !== "default" ? value : null,
          })
          models.variant.set(model, value)
        })
      },
      cycle() {
        const items = variants()
        if (!items.length) return
        selection.variant.set(
          cycleModelVariant({ variants: items, selected: selection.variant.current() ?? null, configured: undefined }),
        )
      },
    },
  }
  return selection
}
