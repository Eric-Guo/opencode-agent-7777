import { abort } from "@opencode/util/abort"
import { createSignal, untrack } from "solid-js"
import type { OpencodeClient } from "@/runtime/server/client-compact"
import { INITIAL_FILE_SEARCH_STATE, transitionFileSearch, type FileSearchEvent } from "./search-machine"

type FileSearchScope = { client: Pick<OpencodeClient, "file">; directory: string }

// The compact app needs directory-scoped search, without file tabs or a workspace provider.
export function createFileSearch(scope: () => FileSearchScope | undefined) {
  const [search, setSearch] = createSignal(INITIAL_FILE_SEARCH_STATE)
  let pending: AbortController | undefined

  const dispatch = (event: FileSearchEvent) => {
    const previous = untrack(search)
    const next = transitionFileSearch(previous, event)
    if (next === previous) return false
    setSearch(next)
    return true
  }
  const clear = () => {
    abort(pending)
    pending = undefined
    dispatch({ type: "search.cleared" })
  }

  return {
    state: {
      get status() {
        return search().status
      },
    },
    clear,
    async searchFilesAndDirectories(query: string): Promise<string[]> {
      clear()
      const active = scope()
      if (!active || !query.trim()) return []
      const controller = new AbortController()
      pending = controller
      dispatch({ type: "search.requested" })
      const attempt = untrack(search).attempt
      try {
        const result = await active.client.file.find(
          { location: { directory: active.directory }, query, limit: 50 },
          { signal: controller.signal },
        )
        const paths = [...new Set(result.data.map((entry) => entry.path))]
        return dispatch({ type: "search.succeeded", attempt }) ? paths : []
      } catch {
        dispatch({ type: "search.failed", attempt })
        return []
      } finally {
        if (pending === controller) pending = undefined
      }
    },
  }
}
