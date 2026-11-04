import type { Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import type { RecentChat as SessionInfo, RecentPage } from "@/nexus/chat"

export type HomeSessionSource = {
  sessionID: string
  list: (cursor?: string, signal?: AbortSignal) => Promise<RecentPage>
}

export async function loadHomeSessionPage(
  source: HomeSessionSource,
  input: {
    cursor?: string
    search?: string
    knownIDs?: string[]
    signal?: AbortSignal
  } = {},
) {
  const seen = new Set(input.knownIDs)
  const visited = new Set<string>()
  const items: SessionInfo[] = []
  const query = input.search?.trim().toLocaleLowerCase() ?? ""
  let cursor = input.cursor
  do {
    input.signal?.throwIfAborted()
    if (cursor) visited.add(cursor)
    const page = await source.list(cursor, input.signal)
    for (const row of page.items) {
      if (row.id === source.sessionID || seen.has(row.id)) continue
      if (query && !row.title.toLocaleLowerCase().includes(query) && row.id !== query) continue
      seen.add(row.id)
      items.push(row)
    }
    cursor = page.next ?? undefined
    if (cursor && visited.has(cursor)) throw new Error("Conversation cursor did not advance")
  } while (cursor && items.length === 0)
  return { items, cursor }
}

export function createHomeSessionIndex(input: {
  source: Accessor<HomeSessionSource | undefined>
  searchDelay?: number
}) {
  const [state, setState] = createStore({
    items: [] as SessionInfo[],
    query: "",
    cursor: undefined as string | undefined,
    loaded: false,
    loading: false,
    failed: false,
  })
  let generation = 0
  let request: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = (query = "") => {
    generation++
    request?.abort()
    clearTimeout(timer)
    setState({ items: [], query, cursor: undefined, loaded: false, loading: false, failed: false })
  }
  const more = async () => {
    if (state.loading || (state.loaded && !state.cursor)) return
    const source = input.source()
    if (!source) return
    const version = generation
    const abort = new AbortController()
    request = abort
    const current = () => version === generation && input.source() === source && !abort.signal.aborted
    setState({ loading: true, failed: false })
    try {
      const page = await loadHomeSessionPage(source, {
        cursor: state.cursor,
        search: state.query,
        knownIDs: state.items.map((item) => item.id),
        signal: abort.signal,
      })
      if (!current()) return
      setState({ items: [...state.items, ...page.items], cursor: page.cursor, loaded: true })
    } catch {
      if (current()) setState("failed", true)
    } finally {
      if (current()) setState("loading", false)
    }
  }
  return {
    list: () => state.items,
    loading: () => state.loading,
    failed: () => state.failed,
    hasMore: () => !!state.cursor,
    more,
    clear,
    refresh(query = "") {
      clear(query.trim())
      return more()
    },
    search(value: string) {
      const query = value.trim()
      if (query === state.query) return
      clear(query)
      if (!query) return void more()
      // Clear obsolete results immediately, then debounce network work while typing.
      setState("loading", true)
      timer = setTimeout(() => {
        setState("loading", false)
        void more()
      }, input.searchDelay ?? 200)
    },
  }
}

export type HomeSessionIndex = ReturnType<typeof createHomeSessionIndex>
