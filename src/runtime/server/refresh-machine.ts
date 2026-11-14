export type RefreshState =
  | { readonly status: "idle"; readonly attempt: number }
  | { readonly status: "scheduled"; readonly attempt: number; readonly delay: number }
  | { readonly status: "loading"; readonly attempt: number; readonly limit: number; readonly again: boolean }
  | { readonly status: "failed"; readonly attempt: number; readonly error: unknown }
  | { readonly status: "disposed"; readonly attempt: number }
export type RefreshEvent =
  | { readonly type: "schedule"; readonly delay: number }
  | { readonly type: "refresh"; readonly limit: number }
  | { readonly type: "succeeded"; readonly attempt: number }
  | { readonly type: "failed"; readonly attempt: number; readonly error: unknown }
  | { readonly type: "disposed" }
export const createRefreshState = (): RefreshState => ({ status: "idle", attempt: 0 })
export function transitionRefresh(state: RefreshState, event: RefreshEvent): RefreshState {
  if (state.status === "disposed") return state
  if (event.type === "disposed") return { status: "disposed", attempt: state.attempt }
  if (event.type === "schedule")
    return state.status === "loading"
      ? { ...state, again: true }
      : { status: "scheduled", attempt: state.attempt + 1, delay: event.delay }
  if (event.type === "refresh")
    return state.status === "loading"
      ? state.again
        ? state
        : { ...state, again: true }
      : { status: "loading", attempt: state.attempt + 1, limit: event.limit, again: false }
  if (state.status !== "loading" || state.attempt !== event.attempt) return state
  if (event.type === "failed") return { status: "failed", attempt: state.attempt, error: event.error }
  return state.again
    ? { ...state, attempt: state.attempt + 1, again: false }
    : { status: "idle", attempt: state.attempt }
}
export const refreshLoading = (state: RefreshState) => state.status === "loading"
