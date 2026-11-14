// Finite reads share admission rules; feature drivers retain their targets and publication policy.
export type LoadState =
  | { readonly status: "idle" | "ready"; readonly attempt: number }
  | { readonly status: "loading"; readonly attempt: number }
  | { readonly status: "failed"; readonly attempt: number; readonly error: unknown }
  | { readonly status: "disposed"; readonly attempt: number }

export type LoadEvent =
  | { readonly type: "started" }
  | { readonly type: "succeeded"; readonly attempt: number }
  | { readonly type: "failed"; readonly attempt: number; readonly error: unknown }
  | { readonly type: "disposed" }

export const createLoadState = (): LoadState => ({ status: "idle", attempt: 0 })
export function transitionLoad(state: LoadState, event: LoadEvent): LoadState {
  if (event.type === "started") return { status: "loading", attempt: state.attempt + 1 }
  if (event.type === "disposed") return { status: "disposed", attempt: state.attempt }
  if (state.status !== "loading" || state.attempt !== event.attempt) return state
  return event.type === "succeeded"
    ? { status: "ready", attempt: state.attempt }
    : { status: "failed", attempt: state.attempt, error: event.error }
}
