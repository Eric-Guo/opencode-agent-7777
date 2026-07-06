import { createEffect } from "solid-js"

export function useSessionHashScroll(input: {
  items: () => readonly unknown[]
  container: () => HTMLElement | undefined
}) {
  createEffect(() => {
    input.items().length
    queueMicrotask(() => {
      const container = input.container()
      if (!container) return
      container.scrollTop = container.scrollHeight
    })
  })
}
