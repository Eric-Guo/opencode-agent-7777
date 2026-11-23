export const FORK_TIMEOUT_MS = 30_000

export type ForkState = {
  readonly status: "idle" | "confirming-replace" | "creating" | "confirming-open" | "opening" | "disposed"
  readonly attempt: number
}

export type ForkEvent =
  | { type: "requested"; confirm: boolean }
  | { type: "approved"; attempt: number }
  | { type: "created"; attempt: number; confirm: boolean }
  | { type: "finished"; attempt: number }
  | { type: "disposed" }

export function createForkState(): ForkState {
  return { status: "idle", attempt: 0 }
}

export function transitionFork(state: ForkState, event: ForkEvent): ForkState {
  if (state.status === "disposed") return state
  if (event.type === "disposed") return { ...state, status: "disposed" }
  if (event.type === "requested") {
    if (state.status !== "idle") return state
    return { status: event.confirm ? "confirming-replace" : "creating", attempt: state.attempt + 1 }
  }
  if (state.status === "idle" || state.attempt !== event.attempt) return state
  if (event.type === "finished") return { ...state, status: "idle" }
  if (event.type === "created" && state.status === "creating")
    return { ...state, status: event.confirm ? "confirming-open" : "opening" }
  if (event.type === "approved") {
    if (state.status === "confirming-replace") return { ...state, status: "creating" }
    if (state.status === "confirming-open") return { ...state, status: "opening" }
  }
  return state
}
