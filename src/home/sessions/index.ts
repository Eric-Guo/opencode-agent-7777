import type { SessionInfo, SessionListInput, SessionsResponse } from "@opencode/client/promise"
import { abort } from "@opencode/util/abort"
import { sameDirectory } from "@opencode/util/path"
import { RECENT_SESSION_PAGE_SIZE } from "@/constants/session"
import { isSessionNotFoundError } from "@/runtime/server/errors"
import { bounded } from "@/runtime/server/operation"

export type HomeSessionSource = {
  directory: string
  sessionID: string
  list: (input: SessionListInput, options?: { signal?: AbortSignal }) => Promise<SessionsResponse>
  get: (input: { sessionID: string }, options?: { signal?: AbortSignal }) => Promise<SessionInfo>
}

type PageQuery = { cursor?: string; search?: string; knownIDs?: string[] }
const PAGE_TIMEOUT_MS = 30_000

export function loadHomeSessionPage(source: HomeSessionSource, input: PageQuery & { signal?: AbortSignal } = {}) {
  // One deadline covers the whole visible page, including an exact lookup and any cursor backfill.
  return bounded((signal) => readPage(source, input, signal), { signal: input.signal, timeoutMs: PAGE_TIMEOUT_MS })
}

async function fetchPage(source: HomeSessionSource, input: SessionListInput, signal: AbortSignal) {
  const id = input.search
  if (input.cursor || !id?.startsWith("ses_") || id.length <= 20) return { page: await source.list(input, { signal }) }

  // The server searches titles. Look up a full ID alongside the first page and cancel the sibling if either fails.
  const pair = new AbortController()
  const options = { signal: AbortSignal.any([signal, pair.signal]) }
  const lookup = async () => {
    try {
      return await source.get({ sessionID: id }, options)
    } catch (error) {
      if (!isSessionNotFoundError(error, id)) throw error
    }
  }
  try {
    const [page, matched] = await Promise.all([source.list(input, options), lookup()])
    return { page, matched }
  } catch (error) {
    abort(pair)
    throw error
  }
}

// Keep the server cursor at the last consumed row, including when the active
// session or a duplicate overlaps a page. Never slice away an unfetched cursor row.
async function readPage(source: HomeSessionSource, input: PageQuery, signal: AbortSignal) {
  const seen = new Set(input.knownIDs)
  const cursors = new Set<string>()
  const items: SessionInfo[] = []
  let cursor = input.cursor
  const include = (session: SessionInfo) => {
    if (
      session.id === source.sessionID ||
      seen.has(session.id) ||
      !sameDirectory(session.location.directory, source.directory)
    )
      return
    seen.add(session.id)
    items.push(session)
  }
  const query = input.search?.trim()
  do {
    signal.throwIfAborted()
    if (cursor) cursors.add(cursor)
    const { page, matched } = await fetchPage(
      source,
      {
        directory: source.directory,
        limit: RECENT_SESSION_PAGE_SIZE - items.length,
        order: "desc",
        ...(query ? { search: query } : {}),
        ...(cursor ? { cursor } : {}),
      },
      signal,
    )
    // Exact IDs usually have no title matches. If there are both, retain the
    // exact match as well instead of discarding a row covered by the cursor.
    if (matched) include(matched)
    page.data.forEach(include)
    cursor = page.cursor.next ?? undefined
    if (cursor && cursors.has(cursor)) throw new Error("Session cursor did not advance")
  } while (cursor && items.length < RECENT_SESSION_PAGE_SIZE)
  return { items, cursor }
}
