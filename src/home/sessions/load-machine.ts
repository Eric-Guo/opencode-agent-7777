import type { RecentChat } from "@/nexus/chat"

type Page = { items: RecentChat[]; cursor?: string }

// Compact Home has one cursor-paged query, without the main app's shared server cache.
export type HomeSessionsLoadState = Page & {
  readonly status: "idle" | "debouncing" | "loading" | "ready" | "error"
  readonly attempt: number
  readonly query: string
}

export type HomeSessionsLoadEvent =
  | { type: "reset"; query: string; debounce?: boolean }
  | { type: "debounce.completed"; attempt: number }
  | { type: "fetch.requested" }
  | ({ type: "fetch.succeeded"; attempt: number } & Page)
  | { type: "fetch.failed"; attempt: number }

export function createHomeSessionsLoadState(): HomeSessionsLoadState {
  return { status: "idle", attempt: 0, query: "", items: [] }
}

export function transitionHomeSessionsLoad(
  state: HomeSessionsLoadState,
  event: HomeSessionsLoadEvent,
): HomeSessionsLoadState {
  if (event.type === "reset") {
    return {
      status: event.debounce ? "debouncing" : "idle",
      attempt: state.attempt + 1,
      query: event.query,
      items: [],
    }
  }
  if (event.type === "debounce.completed") {
    if (state.status !== "debouncing" || state.attempt !== event.attempt) return state
    return { ...state, status: "idle" }
  }
  if (event.type === "fetch.requested") {
    if (selectHomeSessionsLoading(state) || (state.status === "ready" && !state.cursor)) return state
    return { ...state, status: "loading", attempt: state.attempt + 1 }
  }
  if (state.status !== "loading" || state.attempt !== event.attempt) return state
  if (event.type === "fetch.failed") return { ...state, status: "error" }
  return { ...state, status: "ready", items: [...state.items, ...event.items], cursor: event.cursor }
}

export function selectHomeSessionsLoading(state: HomeSessionsLoadState) {
  return state.status === "debouncing" || state.status === "loading"
}
