import type { RequestKey } from "./reply-machine"
export type RequestListState =
  | { readonly status: "idle"; readonly attempt: number }
  | { readonly status: "loading"; readonly attempt: number; readonly updates: readonly RequestKey[] }
export type RequestListEvent =
  | { readonly type: "started" }
  | { readonly type: "updated"; readonly request: RequestKey }
  | { readonly type: "finished"; readonly attempt: number }
export const createRequestListState = (): RequestListState => ({ status: "idle", attempt: 0 })
export function transitionRequestList(state: RequestListState, event: RequestListEvent): RequestListState {
  if (event.type === "started") return { status: "loading", attempt: state.attempt + 1, updates: [] }
  if (state.status !== "loading") return state
  if (event.type === "updated")
    return {
      ...state,
      updates: [
        event.request,
        ...state.updates.filter((item) => item.id !== event.request.id || item.sessionID !== event.request.sessionID),
      ],
    }
  return event.attempt === state.attempt ? { status: "idle", attempt: state.attempt } : state
}
