import { createEffect } from "solid-js"

const POINTER_GESTURE_WINDOW_MS = 250

export function createSessionTimelineInteraction(input: { items: () => readonly unknown[] }) {
  let scroller: HTMLElement | undefined
  let pointerGesture = 0

  createEffect(() => {
    input.items().length
    queueMicrotask(() => {
      if (Date.now() - pointerGesture < POINTER_GESTURE_WINDOW_MS) return
      if (!scroller) return
      scroller.scrollTop = scroller.scrollHeight
    })
  })

  const markUserScroll = (target?: EventTarget | null) => {
    if (!scroller) return
    const element = target instanceof Element ? target : undefined
    const nested = element?.closest("[data-scrollable]")
    if (nested && nested !== scroller) return
    pointerGesture = Date.now()
  }

  return {
    scroller: () => scroller,
    view: {
      setScrollRef: (element: HTMLElement | undefined) => {
        scroller = element
      },
      markUserScroll,
    },
  }
}
