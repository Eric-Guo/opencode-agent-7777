export type ComposerSubmitState<T> =
  | { readonly status: "idle"; readonly attempt: number }
  | {
      readonly status: "running"
      readonly phase: "creating" | "configuring" | "sending"
      readonly attempt: number
      readonly snapshot: T
    }
  | { readonly status: "accepted" | "failed" | "disposed"; readonly attempt: number }
export type ComposerSubmitEvent<T> =
  | { readonly type: "submit"; readonly snapshot: T; readonly creating: boolean }
  | { readonly type: "advance"; readonly attempt: number; readonly phase: "configuring" | "sending" }
  | { readonly type: "accepted" | "failed" | "disposed"; readonly attempt: number }
export const createComposerSubmitState = <T>(): ComposerSubmitState<T> => ({ status: "idle", attempt: 0 })
export function transitionComposerSubmit<T>(
  state: ComposerSubmitState<T>,
  event: ComposerSubmitEvent<T>,
): ComposerSubmitState<T> {
  if (event.type === "submit")
    return state.status === "running"
      ? state
      : {
          status: "running",
          phase: event.creating ? "creating" : "configuring",
          attempt: state.attempt + 1,
          snapshot: event.snapshot,
        }
  if (state.status !== "running" || state.attempt !== event.attempt) return state
  if (event.type === "advance") {
    if (state.phase === "sending" || (state.phase === "configuring" && event.phase !== "sending")) return state
    return { ...state, phase: event.phase }
  }
  return { status: event.type, attempt: state.attempt }
}
export const composerSubmitting = <T>(state: ComposerSubmitState<T>) => state.status === "running"
