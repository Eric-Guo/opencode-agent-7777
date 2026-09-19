import { batch, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import { createModelsController, findModel, modelOptions, type ModelKey, type ModelOption } from "./models"
import { cycleModelVariant, getConfiguredAgentVariant, resolveModelVariant } from "./variant"
import type { ProviderListResponse } from "@/runtime/server/types"
import {
  readModelSelection,
  readSessionModelSelections,
  writeModelSelection,
  writeSessionModelSelections,
  type SessionModelSelection,
} from "@/runtime/persistence/storage-compact"
import { currentLocalAgent, setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"

export type ModelLoadStatus = "loading" | "ready" | "failed"

export type ModelSelectorState = {
  current: () => ModelOption | undefined
  list: () => ModelOption[]
  recent: () => ModelOption[]
  cycle: (direction: 1 | -1) => void
  set: (model: ModelKey | undefined, options?: { recent?: boolean }) => void
  visible: (model: ModelKey) => boolean
  setVisibility: (model: ModelKey, visible: boolean) => void
  setProviderVisibility: (providerID: string, visible: boolean) => void
  trackSessionCommit: (selection: SessionModelSelection) => () => void
  variant: {
    current: () => string | undefined
    list: () => string[]
    set: (value: string | undefined) => void
    cycle: () => void
  }
}

const models = createRoot(() => createModelsController(() => state.models))
const [choices, setChoices] = createStore(readSessionModelSelections())
const pending = new Map<string, SessionModelSelection>()

function scope() {
  const session = state.session
  if (!session) return
  return JSON.stringify([state.server?.url ?? "", sessionDirectory(session), session.id, currentLocalAgent()])
}

function writeChoice(key: string, value: SessionModelSelection | undefined) {
  // Whole values avoid mutating snapshots retained by an in-flight submission.
  setChoices(key, () => value && { model: { ...value.model }, variant: value.variant })
  writeSessionModelSelections(choices)
}

function durable() {
  const session = state.session
  if (session?.agent && session.agent !== currentLocalAgent()) return
  const model = session?.model
  if (!model) return
  return { model: { providerID: model.providerID, modelID: model.id }, variant: model.variant ?? null }
}

function sameChoice(a: SessionModelSelection | undefined, b: SessionModelSelection) {
  return a?.model.providerID === b.model.providerID && a.model.modelID === b.model.modelID && a.variant === b.variant
}

// Retire only the acknowledged submission; a newer draft selection still belongs to the composer.
export function reconcileModelSelection() {
  const key = scope()
  if (!key || state.session?.agent !== currentLocalAgent()) return
  const expected = pending.get(key)
  if (!expected || !sameChoice(durable(), expected)) return
  pending.delete(key)
  if (sameChoice(choices[key], expected)) writeChoice(key, undefined)
}

export function resolveSelectedModel<T extends ModelKey>(
  options: T[],
  defaults: ProviderListResponse["default"],
  stored: ModelKey | undefined,
  configured: ModelKey | undefined,
) {
  const storedOption = findModel(options, stored)
  if (storedOption) return { providerID: storedOption.providerID, modelID: storedOption.modelID }

  const configuredDefaultOption = findModel(options, configured)
  if (configuredDefaultOption) {
    return { providerID: configuredDefaultOption.providerID, modelID: configuredDefaultOption.modelID }
  }

  for (const option of options) {
    const modelID = defaults[option.providerID]
    if (!modelID) continue
    const defaultOption = findModel(options, { providerID: option.providerID, modelID })
    if (defaultOption) return { providerID: defaultOption.providerID, modelID: defaultOption.modelID }
  }

  const first = options[0]
  if (!first) return
  return { providerID: first.providerID, modelID: first.modelID }
}

export function syncModelSelection(catalog: ProviderListResponse) {
  const options = modelOptions(catalog)
  const selected = resolveSelectedModel(
    options,
    catalog.default,
    readModelSelection(),
    DEFAULT_MODEL_CONFIG.defaultSelection ?? undefined,
  )
  batch(() => {
    setState("models", options)
    setState("selectedModel", selected)
    models.compact()
  })
  if (selected) writeModelSelection(selected)
  reconcileModelSelection()
}

// Active-session selection delegates visibility and recency to the models controller.
export function createModelSelection(): ModelSelectorState {
  const choice = () => {
    const key = scope()
    const value = key ? choices[key] : undefined
    return value && models.find(value.model) ? value : undefined
  }
  const current = () =>
    models.find(choice()?.model) ?? models.find(durable()?.model) ?? models.find(state.selectedModel)
  const variants = () => Object.keys(current()?.variants ?? {}).filter((value) => value !== "default")
  const configured = (model = current()) => {
    const agent = state.agentModels[currentLocalAgent()]
    return getConfiguredAgentVariant({ agent: agent && { model: agent, variant: agent.variant }, model })
  }
  const selectedVariant = () => {
    const draft = choice()
    if (draft) return draft.variant
    const value = durable()
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
        const key = scope()
        if (key) {
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
          writeChoice(key, selected ? { model: selected, variant: nextVariant ?? null } : undefined)
        }
        setState("selectedModel", selected)
        writeModelSelection(selected)
        if (!selected) return
        models.setVisibility(selected, true)
        if (options?.recent) models.recent.push(selected)
      })
    },
    visible: models.visible,
    setVisibility: models.setVisibility,
    setProviderVisibility: models.setProviderVisibility,
    trackSessionCommit(value) {
      const key = scope()
      if (!key) return () => {}
      const expected = { model: { ...value.model }, variant: value.variant }
      pending.set(key, expected)
      reconcileModelSelection()
      return () => {
        if (pending.get(key) === expected) pending.delete(key)
      }
    },
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
          const key = scope()
          if (key)
            writeChoice(key, {
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
