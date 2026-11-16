export const MENU_CLOSE_TIMEOUT_MS = 600

type LiveState = { readonly attempt: number; readonly restoreTrigger: boolean }
export type MenuDismissState<T> =
  | (LiveState & { readonly status: "ready" | "settled" })
  | (LiveState & { readonly status: "waiting"; readonly action: T })
  | (LiveState & { readonly status: "settling"; readonly action: T; readonly frames: 2 | 1 })
  | { readonly status: "disposed"; readonly attempt: number }

export type MenuDismissEvent<T> =
  | { readonly type: "opened" }
  | { readonly type: "owner.changed" }
  | { readonly type: "disposed" }
  | { readonly type: "restore.changed"; readonly allow: boolean }
  | { readonly type: "scheduled"; readonly attempt: number; readonly action: T }
  | { readonly type: "frame"; readonly attempt: number; readonly connected: boolean }
  | { readonly type: "timed-out"; readonly attempt: number }

export type MenuDismissEffect<T> =
  | { readonly type: "cancel" }
  | { readonly type: "deadline"; readonly attempt: number }
  | { readonly type: "frame"; readonly attempt: number }
  | { readonly type: "run"; readonly action: T }

export const createMenuDismissState = <T>(): MenuDismissState<T> => ({
  status: "ready",
  attempt: 0,
  restoreTrigger: true,
})

export function transitionMenuDismiss<T>(
  state: MenuDismissState<T>,
  event: MenuDismissEvent<T>,
): { state: MenuDismissState<T>; effects: readonly MenuDismissEffect<T>[] } {
  const same = { state, effects: [] }
  if (state.status === "disposed") return same
  if (event.type === "disposed")
    return { state: { status: "disposed", attempt: state.attempt + 1 }, effects: [{ type: "cancel" }] }
  if (event.type === "opened" || event.type === "owner.changed")
    return {
      state: { status: "ready", attempt: state.attempt + 1, restoreTrigger: true },
      effects: [{ type: "cancel" }],
    }
  if (event.type === "restore.changed")
    return event.allow === state.restoreTrigger
      ? same
      : { state: { ...state, restoreTrigger: event.allow }, effects: [] }
  if (event.attempt !== state.attempt) return same
  if (event.type === "scheduled") {
    if (state.status !== "ready") return same
    return {
      state: { ...state, status: "waiting", action: event.action },
      effects: [
        { type: "deadline", attempt: state.attempt },
        { type: "frame", attempt: state.attempt },
      ],
    }
  }
  if (state.status !== "waiting" && state.status !== "settling") return same
  if (event.type === "timed-out" || (state.status === "settling" && state.frames === 1))
    return {
      state: { status: "settled", attempt: state.attempt, restoreTrigger: state.restoreTrigger },
      effects: [{ type: "cancel" }, { type: "run", action: state.action }],
    }
  return {
    state:
      state.status === "waiting"
        ? event.connected
          ? state
          : { ...state, status: "settling", frames: 2 }
        : { ...state, frames: 1 },
    effects: [{ type: "frame", attempt: state.attempt }],
  }
}
