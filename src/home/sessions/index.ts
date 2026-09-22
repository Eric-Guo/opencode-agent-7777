import type { SessionInfo, SessionListInput, SessionsResponse } from "@opencode/client/promise"
import type { Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { RECENT_SESSION_PAGE_SIZE } from "@/constants/session"
import { isSessionNotFoundError } from "@/runtime/server/errors"
import { normalizeSessionDirectory } from "@/session/directory"

export type HomeSessionSource = {
  directory: string
  sessionID: string
  list: (input: SessionListInput, options?: { signal?: AbortSignal }) => Promise<SessionsResponse>
  get: (input: { sessionID: string }, options?: { signal?: AbortSignal }) => Promise<SessionInfo>
}

// Keep the server cursor at the last consumed row, including when the active
// session or a duplicate overlaps a page. Never slice away an unfetched cursor row.
export async function loadHomeSessionPage(
  source: HomeSessionSource,
  input: { cursor?: string; search?: string; knownIDs?: string[]; signal?: AbortSignal } = {},
) {
  const directory = normalizeSessionDirectory(source.directory)
  const seen = new Set(input.knownIDs)
  const cursors = new Set<string>()
  const items: SessionInfo[] = []
  let cursor = input.cursor
  const include = (session: SessionInfo) => {
    if (
      session.id === source.sessionID ||
      seen.has(session.id) ||
      normalizeSessionDirectory(session.location.directory) !== directory
    )
      return
    seen.add(session.id)
    items.push(session)
  }
  const query = input.search?.trim()
  const exact =
    !cursor && query?.startsWith("ses_") && query.length > 20
      ? source.get({ sessionID: query }, { signal: input.signal }).catch((error) => {
          if (!isSessionNotFoundError(error, query)) throw error
          return undefined
        })
      : Promise.resolve(undefined)

  // Title search runs on the server across all history. A full ID also gets an
  // exact lookup because the server's list search only matches session titles.
  let first = true
  do {
    input.signal?.throwIfAborted()
    if (cursor) cursors.add(cursor)
    const [page, matched] = await Promise.all([
      source.list(
        {
          directory,
          limit: RECENT_SESSION_PAGE_SIZE - items.length,
          order: "desc",
          ...(query ? { search: query } : {}),
          ...(cursor ? { cursor } : {}),
        },
        { signal: input.signal },
      ),
      first ? exact : Promise.resolve(undefined),
    ])
    first = false
    // Exact IDs usually have no title matches. If there are both, retain the
    // exact match as well instead of discarding a row covered by the cursor.
    if (matched) include(matched)
    page.data.forEach(include)
    cursor = page.cursor.next ?? undefined
    if (cursor && cursors.has(cursor)) throw new Error("Session cursor did not advance")
  } while (cursor && items.length < RECENT_SESSION_PAGE_SIZE)
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
