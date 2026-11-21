const INITIAL_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000

type StreamState =
  | { status: "connecting" | "waiting"; delay: number }
  | { status: "live"; greeted: boolean }
  | { status: "disposed" }

type StreamEvent = "activity" | "greeting" | "ended" | "retry" | "dispose"

export const initialStreamState = (): StreamState => ({ status: "connecting", delay: INITIAL_RETRY_MS })

export function transitionStream(state: StreamState, event: StreamEvent): StreamState {
  if (state.status === "disposed") return state
  switch (event) {
    case "dispose":
      return { status: "disposed" }
    case "retry":
      return state.status === "waiting"
        ? { status: "connecting", delay: Math.min(MAX_RETRY_MS, state.delay * 2) }
        : state
    case "activity":
      return state.status === "connecting" ? { status: "live", greeted: false } : state
    case "greeting":
      return state.status === "connecting" || (state.status === "live" && !state.greeted)
        ? { status: "live", greeted: true }
        : state
    case "ended":
      return state.status === "waiting"
        ? state
        : { status: "waiting", delay: state.status === "live" ? INITIAL_RETRY_MS : state.delay }
  }
}
