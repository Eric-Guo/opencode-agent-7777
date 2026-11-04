import type { RecentChat, RecentPage } from "@/nexus/chat"

export type HomeSessionPageQuery = { cursor?: string; search?: string; knownIDs?: string[] }

export function createHomeSessionSearchPage(scope: { sessionID: string }, input: HomeSessionPageQuery) {
  const query = input.search?.trim().toLocaleLowerCase() ?? ""
  const seen = new Set(input.knownIDs)
  const visited = new Set<string>()
  const items: RecentChat[] = []
  let cursor = input.cursor

  return {
    request: () => cursor,
    accept(page: RecentPage) {
      for (const row of page.items) {
        if (row.id === scope.sessionID || seen.has(row.id)) continue
        if (query && !row.title.toLocaleLowerCase().includes(query) && row.id !== query) continue
        seen.add(row.id)
        items.push(row)
      }
      if (cursor) visited.add(cursor)
      cursor = page.next ?? undefined
      if (cursor && visited.has(cursor)) throw new Error("Conversation cursor did not advance")
      if (!cursor || items.length) return { items, cursor }
    },
  }
}
