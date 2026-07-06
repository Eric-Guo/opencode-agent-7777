import { createEffect } from "solid-js"

export function useSessionHashScroll(input: {
  items: () => readonly unknown[]
  container: () => HTMLElement | undefined
  shouldScrollToEnd?: () => boolean
}) {
  createEffect(() => {
    input.items().length
    queueMicrotask(() => {
      if (input.shouldScrollToEnd?.() === false) return
      const container = input.container()
      if (!container) return
      container.scrollTop = container.scrollHeight
    })
  })
}
