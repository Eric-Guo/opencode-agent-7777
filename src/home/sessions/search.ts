import { createStore } from "solid-js/store"
import type { SessionInfo } from "@opencode/client/promise"
import type { HomeSessionsController } from "./controller"
import { recentSessionTitle } from "./recent-compact"

export function searchSessions(sessions: SessionInfo[], query: string) {
  const value = query.trim().toLowerCase()
  if (!value) return sessions
  return sessions.filter((session) => `${recentSessionTitle(session)} ${session.id}`.toLowerCase().includes(value))
}

export function createHomeSessionSearchController(sessions: HomeSessionsController) {
  const [state, setState] = createStore({ value: "", highlighted: "" })
  const results = () => searchSessions(sessions.data.list(), state.value)
  const active = () => {
    const items = results()
    return items.find((item) => item.id === state.highlighted)?.id ?? items[0]?.id
  }
  const reset = () => setState({ value: "", highlighted: "" })

  return {
    query: {
      value: () => state.value,
      input: (value: string) => setState({ value, highlighted: "" }),
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
