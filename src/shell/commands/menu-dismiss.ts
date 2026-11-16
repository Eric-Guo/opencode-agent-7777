import { createEffect, on, onCleanup, untrack, type Accessor } from "solid-js"
import {
  createMenuDismissState,
  MENU_CLOSE_TIMEOUT_MS,
  transitionMenuDismiss,
  type MenuDismissEvent,
} from "./menu-dismiss-machine"

type CloseAction = { element: HTMLElement | undefined; callback: () => void; current: () => boolean }

/** Owns close work independently of the shared Menu/Popover primitive's focus policy. */
export function createMenuDismissController(content: () => HTMLElement | undefined, owner?: Accessor<unknown>) {
  let state = createMenuDismissState<CloseAction>()
  let frame: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    clearTimeout(timer)
    frame = undefined
    timer = undefined
  }
  const dispatch = (event: MenuDismissEvent<CloseAction>) => {
    const step = transitionMenuDismiss(state, event)
    state = step.state
    for (const effect of step.effects) {
      if (effect.type === "cancel") cancel()
      else if (effect.type === "deadline")
        timer = setTimeout(() => dispatch({ type: "timed-out", attempt: effect.attempt }), MENU_CLOSE_TIMEOUT_MS)
      else if (effect.type === "frame")
        frame = requestAnimationFrame(() => {
          if (state.attempt !== effect.attempt || (state.status !== "waiting" && state.status !== "settling")) return
          frame = undefined
          dispatch({ type: "frame", attempt: effect.attempt, connected: !!state.action.element?.isConnected })
        })
      else if (effect.action.current()) effect.action.callback()
    }
  }
  if (owner) createEffect(on(owner, () => dispatch({ type: "owner.changed" }), { defer: true }))
  onCleanup(() => dispatch({ type: "disposed" }))

  return {
    opened() {
      dispatch({ type: "opened" })
    },
    preventTriggerRestore() {
      dispatch({ type: "restore.changed", allow: false })
    },
    onCloseAutoFocus(event: Event) {
      if (state.status !== "disposed" && !state.restoreTrigger) event.preventDefault()
    },
    // Capture at the user gesture, even when attachment preparation calls afterClose much later.
    capture() {
      const attempt = state.attempt
      const identity = untrack(() => owner?.())
      const element = content()
      const current = () => state.status !== "disposed" && state.attempt === attempt && owner?.() === identity
      return {
        current,
        afterClose(callback: () => void) {
          if (current()) dispatch({ type: "scheduled", attempt, action: { element, callback, current } })
        },
      }
    },
  }
}
