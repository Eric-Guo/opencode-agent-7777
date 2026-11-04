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
