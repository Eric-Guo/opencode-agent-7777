import { createTypeahead } from "@opencode/ui/typeahead"
import { createStore } from "solid-js/store"
import type { HomeSessionsController } from "./controller"

export function createHomeSessionSearchController(sessions: HomeSessionsController, onSelect: () => void) {
  const [state, setState] = createStore({ value: "" })
  const results = sessions.data.list
  const select = (session: ReturnType<typeof results>[number]) => {
    if (sessions.session.open(session)) onSelect()
  }
  const navigation = createTypeahead({
    items: results,
    key: (session) => session.id,
    onSelect: select,
  })
  const reset = () => {
    setState("value", "")
    navigation.setActive(undefined)
  }

  return {
    query: {
      value: () => state.value,
      input(value: string) {
        setState("value", value)
        navigation.setActive(undefined)
        sessions.data.search(value)
      },
      reset,
    },
    result: {
      ...navigation,
      list: results,
      select,
    },
  }
}

export type HomeSessionSearchController = ReturnType<typeof createHomeSessionSearchController>
