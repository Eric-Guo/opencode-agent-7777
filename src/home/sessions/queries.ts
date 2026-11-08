import { abort } from "@opencode/util/abort"
import { createSignal, untrack, type Accessor } from "solid-js"
import { loadHomeSessionPage, type HomeSessionSource } from "./index"
import {
  createHomeSessionsLoadState,
  selectHomeSessionsLoading,
  transitionHomeSessionsLoad,
  type HomeSessionsLoadEvent,
} from "./load-machine"

// Query driver for the header picker; callers clear it on close, source change and disposal.
export function createHomeSessionIndex(input: {
  source: Accessor<HomeSessionSource | undefined>
  searchDelay?: number
}) {
  // Whole-state replacement keeps transition snapshots independent of Solid store merging.
  const [state, setState] = createSignal(createHomeSessionsLoadState())
  let request: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const dispatch = (event: HomeSessionsLoadEvent) => {
    const previous = untrack(state)
    const next = transitionHomeSessionsLoad(previous, event)
    if (next === previous) return false
    setState(next)
    return true
  }
  const reset = (query: string, debounce = false) => {
    abort(request)
    request = undefined
    clearTimeout(timer)
    timer = undefined
    dispatch({ type: "reset", query, debounce })
  }
  const more = async () => {
    const source = input.source()
    if (!source || !dispatch({ type: "fetch.requested" })) return
    const current = untrack(state)
    const controller = new AbortController()
    request = controller
    try {
      const page = await loadHomeSessionPage(source, {
        cursor: current.cursor,
        search: current.query,
        knownIDs: current.items.map((item) => item.id),
        signal: controller.signal,
      })
      if (input.source() !== source) return
      dispatch({ type: "fetch.succeeded", attempt: current.attempt, ...page })
    } catch {
      if (input.source() === source) dispatch({ type: "fetch.failed", attempt: current.attempt })
    } finally {
      if (request === controller) request = undefined
    }
  }
  return {
    list: () => state().items,
    loading: () => selectHomeSessionsLoading(state()),
    failed: () => state().status === "error",
    hasMore: () => !!state().cursor,
    more,
    clear: (query = "") => reset(query),
    refresh(query = "") {
      reset(query.trim())
      return more()
    },
    search(value: string) {
      const query = value.trim()
      if (query === untrack(state).query) return
      reset(query, !!query)
      if (!query) return void more()
      // Clear obsolete results immediately, then debounce network work while typing.
      const attempt = untrack(state).attempt
      timer = setTimeout(() => {
        timer = undefined
        if (dispatch({ type: "debounce.completed", attempt })) void more()
      }, input.searchDelay ?? 200)
    },
  }
}

export type HomeSessionIndex = ReturnType<typeof createHomeSessionIndex>
