import type { SessionInfo, SessionListInput, SessionsResponse } from "@opencode/client/promise"
import { RECENT_SESSION_PAGE_SIZE } from "@/constants/session"
import { isSessionNotFoundError } from "@/runtime/server/errors"

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
  const seen = new Set(input.knownIDs)
  const cursors = new Set<string>()
  const items: SessionInfo[] = []
  let cursor = input.cursor
  const include = (session: SessionInfo) => {
    if (
      session.id === source.sessionID ||
      seen.has(session.id) ||
      session.location.directory !== source.directory
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
          directory: source.directory,
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
