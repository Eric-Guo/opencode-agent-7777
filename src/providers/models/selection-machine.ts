import type { ModelSelection, SessionModelSelection } from "@/runtime/server/persistence"
export const COMMIT_ACK_TIMEOUT_MS = 10_000

type Entry =
  | { readonly status: "override"; readonly choice?: SessionModelSelection }
  | {
      readonly status: "awaiting-ack"
      readonly choice?: SessionModelSelection
      readonly expected: SessionModelSelection
      readonly attempt: number
    }
export type ModelSelectionState = {
  readonly attempt: number
  readonly entries: Readonly<Record<string, Entry | undefined>>
}
export type ModelSelectionEvent =
  | { readonly type: "edited"; readonly key: string; readonly choice?: SessionModelSelection }
  | { readonly type: "tracked"; readonly key: string; readonly expected: SessionModelSelection }
  | { readonly type: "reconciled"; readonly key: string; readonly durable?: SessionModelSelection }
  | { readonly type: "cancelled"; readonly key: string; readonly attempt: number }
export const sameChoice = (a: SessionModelSelection | undefined, b: SessionModelSelection | undefined) =>
  !!a &&
  !!b &&
  a.model.providerID === b.model.providerID &&
  a.model.modelID === b.model.modelID &&
  a.variant === b.variant

// An explicit variant, including Default (null), belongs to the choice that supplied the model.
export function selectModelChoice<T extends ModelSelection>(input: {
  draft?: SessionModelSelection
  durable?: SessionModelSelection
  fallback?: ModelSelection
  find: (key: ModelSelection) => T | undefined
}) {
  for (const choice of [input.draft, input.durable]) {
    if (!choice) continue
    const model = input.find(choice.model)
    if (model) return { model, variant: choice.variant }
  }
  const model = input.fallback && input.find(input.fallback)
  if (model) return { model, variant: undefined }
}

export function createModelSelectionState(
  choices: Record<string, SessionModelSelection | undefined>,
): ModelSelectionState {
  return {
    attempt: 0,
    entries: Object.fromEntries(Object.entries(choices).map(([key, choice]) => [key, { status: "override", choice }])),
  }
}
export function transitionModelSelection(state: ModelSelectionState, event: ModelSelectionEvent): ModelSelectionState {
  const previous = state.entries[event.key]
  if (event.type === "edited")
    return {
      ...state,
      entries: {
        ...state.entries,
        [event.key]:
          previous?.status === "awaiting-ack"
            ? { ...previous, choice: event.choice }
            : { status: "override", choice: event.choice },
      },
    }
  if (event.type === "tracked")
    return {
      attempt: state.attempt + 1,
      entries: {
        ...state.entries,
        [event.key]: {
          status: "awaiting-ack",
          attempt: state.attempt + 1,
          expected: event.expected,
          choice: previous?.choice,
        },
      },
    }
  if (previous?.status !== "awaiting-ack") return state
  if (event.type === "reconciled" && !sameChoice(previous.expected, event.durable)) return state
  if (event.type === "cancelled" && event.attempt !== previous.attempt) return state
  return {
    ...state,
    entries: {
      ...state.entries,
      [event.key]: {
        status: "override",
        choice:
          event.type === "reconciled" && sameChoice(previous.choice, previous.expected) ? undefined : previous.choice,
      },
    },
  }
}
