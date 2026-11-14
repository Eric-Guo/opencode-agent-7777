import { batch, createRoot, createSignal } from "solid-js"
import {
  COMMIT_ACK_TIMEOUT_MS,
  createModelSelectionState,
  transitionModelSelection,
  type ModelSelectionEvent,
} from "./selection-machine"
import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import { createModelsController, findModel, modelOptions, type ModelKey, type ModelOption } from "./models"
import type { ProviderListResponse } from "@/runtime/server/types"
import {
  readModelSelection,
  readSessionModelSelections,
  writeModelSelection,
  writeSessionModelSelections,
  type SessionModelSelection,
} from "@/runtime/server/persistence"
import { currentDirectory, currentLocalAgent, setState, state } from "@/runtime/server/session-store-compact"

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
const [selectionState, setSelectionState] = createSignal(createModelSelectionState(readSessionModelSelections()))
const timers = new Map<string, ReturnType<typeof setTimeout>>()
function dispatch(event: ModelSelectionEvent) {
  const previous = selectionState()
  const next = transitionModelSelection(previous, event)
  if (next === previous) return
  setSelectionState(next)
  const before = previous.entries[event.key]
  const after = next.entries[event.key]
  if (before?.choice !== after?.choice) {
    writeSessionModelSelections(
      Object.fromEntries(Object.entries(next.entries).map(([key, entry]) => [key, entry?.choice])),
    )
  }
  if (after?.status === "awaiting-ack" && before?.status === "awaiting-ack" && after.attempt === before.attempt) return
  clearTimeout(timers.get(event.key))
  timers.delete(event.key)
  if (after?.status === "awaiting-ack")
    timers.set(
      event.key,
      setTimeout(() => {
        dispatch({ type: "cancelled", key: event.key, attempt: after.attempt })
      }, COMMIT_ACK_TIMEOUT_MS),
    )
}

function scope() {
  const directory = currentDirectory()
  if (!directory) return
  return JSON.stringify([state.server?.url ?? "", directory, state.session?.id ?? "", currentLocalAgent()])
}

function writeChoice(key: string, value: SessionModelSelection | undefined) {
  // Whole values avoid mutating snapshots retained by an in-flight submission.
  dispatch({ type: "edited", key, choice: value && { model: { ...value.model }, variant: value.variant } })
}

function durable() {
  const session = state.session
  if (session?.agent && session.agent !== currentLocalAgent()) return
  const model = session?.model
  if (!model) return
  return { model: { providerID: model.providerID, modelID: model.id }, variant: model.variant ?? null }
}

// Retire only the acknowledged submission; newer draft choices remain local.
export function reconcileModelSelection() {
  const key = scope()
  if (key && state.session?.agent === currentLocalAgent()) dispatch({ type: "reconciled", key, durable: durable() })
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

// Shared local choices outlive individual composer controllers. Only this boundary writes preferences
// or retires an acknowledged draft; composer/selection.ts owns precedence and user interactions.
export const localModelSelection = {
  models,
  draft: {
    current() {
      const key = scope()
      return key ? selectionState().entries[key]?.choice : undefined
    },
    set(value: SessionModelSelection | undefined) {
      const key = scope()
      if (key) writeChoice(key, value)
    },
  },
  durable,
  fallback: {
    current: () => state.selectedModel,
    set(model: ModelKey | undefined) {
      setState("selectedModel", model)
      writeModelSelection(model)
    },
  },
  trackSessionCommit(value: SessionModelSelection) {
    const key = scope()
    if (!key) return () => {}
    const expected = { model: { ...value.model }, variant: value.variant }
    dispatch({ type: "tracked", key, expected })
    const attempt = selectionState().attempt
    reconcileModelSelection()
    return () => {
      dispatch({ type: "cancelled", key, attempt })
    }
  },
}
