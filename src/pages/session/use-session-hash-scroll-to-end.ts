import { createEffect } from "solid-js"

// Scroll-to-end behavior only; 7777 has no routed message hashes or paged history.

export function useSessionHashScrollToEnd(input: {
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
