import type { RecentPage } from "@/nexus/chat"
import { bounded } from "@/runtime/server/operation"
import { createHomeSessionSearchPage, type HomeSessionPageQuery } from "./search-machine"

export type HomeSessionSource = {
  sessionID: string
  list: (cursor?: string, signal?: AbortSignal) => Promise<RecentPage>
}

const PAGE_TIMEOUT_MS = 30_000

export function loadHomeSessionPage(
  source: HomeSessionSource,
  input: HomeSessionPageQuery & { signal?: AbortSignal } = {},
) {
  // Share one deadline across the Nexus reads needed to produce a visible page.
  return bounded(
    async (signal) => {
      const search = createHomeSessionSearchPage(source, input)
      while (true) {
        signal.throwIfAborted()
        const result = search.accept(await source.list(search.request(), signal))
        if (result) return result
      }
    },
    { signal: input.signal, timeoutMs: PAGE_TIMEOUT_MS },
  )
}
