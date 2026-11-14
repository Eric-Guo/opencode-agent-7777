export type StreamState = { readonly status: "idle" | "connecting" | "live"; readonly attempt: number }
export type StreamEvent =
  | { readonly type: "start" }
  | { readonly type: "stop" }
  | { readonly type: "activity" | "ended"; readonly attempt: number }
export const createStreamState = (): StreamState => ({ status: "idle", attempt: 0 })
export function transitionStream(state: StreamState, event: StreamEvent): StreamState {
  if (event.type === "start") return { status: "connecting", attempt: state.attempt + 1 }
  if (event.type === "stop") return { status: "idle", attempt: state.attempt + 1 }
  if (state.attempt !== event.attempt || state.status === "idle") return state
  const status = event.type === "activity" ? "live" : "idle"
  return status === state.status ? state : { ...state, status }
}
