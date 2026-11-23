import type { SessionInfo, SessionListInput, SessionsResponse } from "@opencode/client/promise"
import { sameDirectory } from "@opencode/util/path"
import { RECENT_SESSION_PAGE_SIZE } from "@/constants/session"

export type HomeSessionPageQuery = { cursor?: string; search?: string; knownIDs?: string[] }
export type HomeSessionSearchRead = { list: SessionListInput; exactID?: string }

// One picker page can span several server cursors after scope filtering and deduplication.
export function createHomeSessionSearchPage(
  scope: { directory: string; sessionID: string },
  input: HomeSessionPageQuery,
) {
  const search = input.search?.trim()
  const seen = new Set(input.knownIDs)
  const cursors = new Set<string>()
  const items: SessionInfo[] = []
  let cursor = input.cursor

  function include(session: SessionInfo) {
    if (
      session.id === scope.sessionID ||
      seen.has(session.id) ||
      !sameDirectory(session.location.directory, scope.directory)
    )
      return
    seen.add(session.id)
    items.push(session)
  }

  return {
    request(): HomeSessionSearchRead {
      return {
        list: {
          directory: scope.directory,
          limit: RECENT_SESSION_PAGE_SIZE - items.length,
          order: "desc",
          ...(search ? { search } : {}),
          ...(cursor ? { cursor } : {}),
        },
        exactID: !cursor && search?.startsWith("ses_") && search.length > 20 ? search : undefined,
      }
    },
    accept(page: SessionsResponse, exact?: SessionInfo) {
      // Keep every row covered by the cursor, even when a separate exact match fills an extra slot.
      if (exact) include(exact)
      page.data.forEach(include)
      if (cursor) cursors.add(cursor)
      cursor = page.cursor.next ?? undefined
      if (cursor && cursors.has(cursor)) throw new Error("Session cursor did not advance")
      if (!cursor || items.length >= RECENT_SESSION_PAGE_SIZE) return { items, cursor }
    },
  }
}
