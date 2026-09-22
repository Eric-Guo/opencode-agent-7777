import { createStore } from "solid-js/store"
import type { HomeSessionsController } from "./controller"

export function createHomeSessionSearchController(sessions: HomeSessionsController) {
  const [state, setState] = createStore({ value: "", highlighted: "" })
  const results = sessions.data.list
  const active = () => {
    const items = results()
    return items.find((item) => item.id === state.highlighted)?.id ?? items[0]?.id
  }
  const reset = () => setState({ value: "", highlighted: "" })

  return {
    query: {
      value: () => state.value,
      input(value: string) {
        setState({ value, highlighted: "" })
        sessions.data.search(value)
      },
      reset,
    },
    result: {
      list: results,
      active,
      highlight: (id: string) => setState("highlighted", id),
      move(delta: number) {
        const items = results()
        if (items.length === 0) return
        const index = items.findIndex((item) => item.id === active())
        setState("highlighted", items[(((index + delta) % items.length) + items.length) % items.length].id)
      },
      selectActive() {
        const item = results().find((item) => item.id === active())
        return item ? sessions.session.open(item) : false
      },
    },
  }
}

export type HomeSessionSearchController = ReturnType<typeof createHomeSessionSearchController>
