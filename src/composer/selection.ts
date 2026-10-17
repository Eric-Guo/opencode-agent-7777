import { batch } from "solid-js"
import { localModelSelection, type ModelSelectorState } from "@/providers/models/selection"
import { cycleModelVariant, getConfiguredAgentVariant, resolveModelVariant } from "@/providers/models/variant"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"

// Composer policy combines draft, durable session and global choices without owning their storage.
export function createPromptModelSelection(): ModelSelectorState {
  const local = localModelSelection
  const models = local.models
  const choice = () => {
    const value = local.draft.current()
    return value && models.find(value.model) ? value : undefined
  }
  const current = () =>
    models.find(choice()?.model) ?? models.find(local.durable()?.model) ?? models.find(local.fallback.current())
  const variants = () => Object.keys(current()?.variants ?? {}).filter((value) => value !== "default")
  const configured = (model = current()) => {
    const agent = state.agentModels[currentLocalAgent()]
    return getConfiguredAgentVariant({ agent: agent && { model: agent, variant: agent.variant }, model })
  }
  const selectedVariant = () => {
    const draft = choice()
    if (draft) return draft.variant
    const value = local.durable()
    if (value && models.find(value.model)) return value.variant
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
      const index = items.findIndex((entry) => entry.providerID === item.providerID && entry.modelID === item.modelID)
      const next =
        index < 0 ? (direction === 1 ? 0 : items.length - 1) : (index + direction + items.length) % items.length
      // Cycling must not reorder the recent list or it would bounce between two models.
      selection.set(items[next])
    },
    set(model, options) {
      const resolved = models.find(model)
      if (model && !resolved) return
      const selected = resolved ? { providerID: resolved.providerID, modelID: resolved.modelID } : undefined
      const previous = current()
      const same = selected && previous?.providerID === selected.providerID && previous.modelID === selected.modelID
      const variant = same ? (selection.variant.current() ?? null) : undefined
      batch(() => {
        // Resolve the new model's preference independently from the previous session model.
        const nextVariant =
          variant !== undefined
            ? variant
            : resolveModelVariant({
                variants: Object.keys(resolved?.variants ?? {}),
                selected: undefined,
                configured: resolved ? configured(resolved) : undefined,
                preferred: selected ? models.variant.get(selected) : undefined,
              })
        local.draft.set(selected ? { model: selected, variant: nextVariant ?? null } : undefined)
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
        const model = current()
        return resolveModelVariant({
          variants: variants(),
          selected: selectedVariant(),
          configured: configured(),
          preferred: model ? models.variant.get(model) : undefined,
        })
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
