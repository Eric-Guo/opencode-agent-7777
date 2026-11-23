import type { SessionInfo, SessionListInput, SessionsResponse } from "@opencode/client/promise"
import { abort } from "@opencode/util/abort"
import { isSessionNotFoundError } from "@/runtime/server/errors"
import { bounded } from "@/runtime/server/operation"
import { createHomeSessionSearchPage, type HomeSessionPageQuery, type HomeSessionSearchRead } from "./search-machine"

export type HomeSessionSource = {
  directory: string
  sessionID: string
  list: (input: SessionListInput, options?: { signal?: AbortSignal }) => Promise<SessionsResponse>
  get: (input: { sessionID: string }, options?: { signal?: AbortSignal }) => Promise<SessionInfo>
}

const PAGE_TIMEOUT_MS = 30_000

export function loadHomeSessionPage(
  source: HomeSessionSource,
  input: HomeSessionPageQuery & { signal?: AbortSignal } = {},
) {
  // One deadline covers the whole visible page, including an exact lookup and any cursor backfill.
  return bounded(
    async (signal) => {
      const search = createHomeSessionSearchPage(source, input)
      while (true) {
        signal.throwIfAborted()
        const { page, matched } = await fetchPage(source, search.request(), signal)
        const result = search.accept(page, matched)
        if (result) return result
      }
    },
    { signal: input.signal, timeoutMs: PAGE_TIMEOUT_MS },
  )
}

async function fetchPage(source: HomeSessionSource, { list, exactID }: HomeSessionSearchRead, signal: AbortSignal) {
  if (!exactID) return { page: await source.list(list, { signal }) }

  // The server searches titles. Look up a full ID alongside the first page and cancel the sibling if either fails.
  const pair = new AbortController()
  const options = { signal: AbortSignal.any([signal, pair.signal]) }
  const lookup = async () => {
    try {
      return await source.get({ sessionID: exactID }, options)
    } catch (error) {
      if (!isSessionNotFoundError(error, exactID)) throw error
    }
  }
  try {
    const [page, matched] = await Promise.all([source.list(list, options), lookup()])
    return { page, matched }
  } catch (error) {
    abort(pair)
    throw error
  }
}
