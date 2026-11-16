import type { ComposerSuggestion } from "../types"

export const MENTION_FILE_DEBOUNCE_MS = 150
export const MENTION_SEARCH_TIMEOUT_MS = 10_000

type Search = { readonly issued: number; readonly owner: unknown; readonly query: string }

export type MentionSearchState =
  | { readonly status: "closed"; readonly issued: number }
  | (Search & { readonly status: "debouncing" | "loading" })
  | (Search & { readonly status: "ready"; readonly items: readonly ComposerSuggestion[] })
  | (Search & { readonly status: "failed" })
  | { readonly status: "disposed" }

export type MentionSearchEvent =
  | { readonly type: "context.changed"; readonly query: string; readonly owner: unknown }
  | { readonly type: "context.closed" }
  | { readonly type: "debounce.fired"; readonly attempt: number; readonly owner: unknown }
  | {
      readonly type: "resolved"
      readonly attempt: number
      readonly owner: unknown
      readonly items: readonly ComposerSuggestion[]
    }
  | { readonly type: "failed" | "timed-out"; readonly attempt: number; readonly owner: unknown }
  | { readonly type: "disposed" }

export type MentionSearchEffect =
  | { readonly type: "debounce"; readonly attempt: number; readonly owner: unknown }
  | { readonly type: "search"; readonly attempt: number; readonly owner: unknown; readonly query: string }
  | { readonly type: "cancel"; readonly attempt: number }

export const INITIAL_MENTION_SEARCH_STATE: MentionSearchState = Object.freeze({ status: "closed", issued: 0 })
const DISPOSED: MentionSearchState = Object.freeze({ status: "disposed" })
const NO_ITEMS: readonly ComposerSuggestion[] = Object.freeze([])
const NO_EFFECTS: readonly MentionSearchEffect[] = Object.freeze([])

export function transitionMentionSearch(
  state: MentionSearchState,
  event: MentionSearchEvent,
): { state: MentionSearchState; effects: readonly MentionSearchEffect[] } {
  if (state.status === "disposed") return { state, effects: NO_EFFECTS }
  if (event.type === "disposed") return { state: DISPOSED, effects: cancel(state) }
  if (event.type === "context.closed")
    return state.status === "closed"
      ? { state, effects: NO_EFFECTS }
      : { state: { status: "closed", issued: state.issued }, effects: cancel(state) }

  if (event.type === "context.changed") {
    if (state.status !== "closed" && state.owner === event.owner && state.query === event.query)
      return { state, effects: NO_EFFECTS }
    const issued = state.issued + 1
    const target = { issued, owner: event.owner, query: event.query }
    return event.query.trim()
      ? {
          state: { status: "debouncing", ...target },
          effects: [...cancel(state), { type: "debounce", attempt: issued, owner: event.owner }],
        }
      : { state: { status: "ready", ...target, items: NO_ITEMS }, effects: cancel(state) }
  }

  if (state.status === "closed" || state.issued !== event.attempt || state.owner !== event.owner)
    return { state, effects: NO_EFFECTS }
  if (event.type === "debounce.fired")
    return state.status === "debouncing"
      ? {
          state: { ...state, status: "loading" },
          effects: [{ type: "search", attempt: state.issued, owner: state.owner, query: state.query }],
        }
      : { state, effects: NO_EFFECTS }
  if (state.status !== "loading") return { state, effects: NO_EFFECTS }
  return {
    state:
      event.type === "resolved" ? { ...state, status: "ready", items: event.items } : { ...state, status: "failed" },
    effects: cancel(state),
  }
}

export function selectMentionFiles(state: MentionSearchState, owner: unknown, query: string) {
  return state.status === "ready" && state.owner === owner && state.query === query ? state.items : NO_ITEMS
}

export function selectMentionSearchStatus(state: MentionSearchState, owner: unknown, query: string) {
  if (state.status === "disposed" || state.status === "closed") return "ready"
  if (state.owner !== owner || state.query !== query) return query.trim() ? "loading" : "ready"
  if (state.status === "debouncing" || state.status === "loading") return "loading"
  return state.status
}

function cancel(state: MentionSearchState): readonly MentionSearchEffect[] {
  return state.status === "debouncing" || state.status === "loading"
    ? [{ type: "cancel", attempt: state.issued }]
    : NO_EFFECTS
}
