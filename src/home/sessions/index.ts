import type { RecentChat as SessionInfo, RecentPage } from "@/nexus/chat"
import { bounded } from "@/runtime/server/operation"

export type HomeSessionSource = {
  sessionID: string
  list: (cursor?: string, signal?: AbortSignal) => Promise<RecentPage>
}

type PageQuery = { cursor?: string; search?: string; knownIDs?: string[] }
const PAGE_TIMEOUT_MS = 30_000

export function loadHomeSessionPage(source: HomeSessionSource, input: PageQuery & { signal?: AbortSignal } = {}) {
  // Share one deadline across the Nexus reads needed to produce a visible page.
  return bounded((signal) => readPage(source, input, signal), { signal: input.signal, timeoutMs: PAGE_TIMEOUT_MS })
}

async function readPage(source: HomeSessionSource, input: PageQuery, signal: AbortSignal) {
  const seen = new Set(input.knownIDs)
  const visited = new Set<string>()
  const items: SessionInfo[] = []
  const query = input.search?.trim().toLocaleLowerCase() ?? ""
  let cursor = input.cursor
  do {
    signal.throwIfAborted()
    if (cursor) visited.add(cursor)
    const page = await source.list(cursor, signal)
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
