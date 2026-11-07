export type FileSearchState = {
  readonly status: "ready" | "loading" | "failed"
  readonly attempt: number
}

export type FileSearchEvent =
  | { readonly type: "search.requested" }
  | { readonly type: "search.cleared" }
  | { readonly type: "search.succeeded"; readonly attempt: number }
  | { readonly type: "search.failed"; readonly attempt: number }

export const INITIAL_FILE_SEARCH_STATE: FileSearchState = Object.freeze({ status: "ready", attempt: 0 })

// Attempts keep increasing across clears, including when returning to an earlier directory or query.
export function transitionFileSearch(state: FileSearchState, event: FileSearchEvent): FileSearchState {
  if (event.type === "search.requested") return { status: "loading", attempt: state.attempt + 1 }
  if (event.type === "search.cleared") {
    return state.status === "ready" ? state : { status: "ready", attempt: state.attempt }
  }
  if (state.status !== "loading" || event.attempt !== state.attempt) return state
  return { status: event.type === "search.succeeded" ? "ready" : "failed", attempt: state.attempt }
}
