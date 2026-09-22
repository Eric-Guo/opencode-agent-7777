import { expect, test } from "bun:test"
import type { SessionInfo, SessionListInput, SessionsResponse } from "@opencode/client/promise"
import { createHomeSessionIndex, loadHomeSessionPage, type HomeSessionSource } from "./index"

function session(id: string, directory = "/repo"): SessionInfo {
  return {
    id,
    title: id,
    projectID: "project",
    location: { directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
}
const page = (data: SessionInfo[], next?: string): SessionsResponse => ({ data, cursor: { next } })
function source(list: HomeSessionSource["list"], get?: HomeSessionSource["get"]): HomeSessionSource {
  return {
    directory: "/repo",
    sessionID: "active",
    list,
    get:
      get ??
      (async ({ sessionID }) => {
        throw { _tag: "SessionNotFoundError", sessionID }
      }),
  }
}
const rows = (start: number, count: number) => Array.from({ length: count }, (_, i) => session(`session-${start + i}`))

test("browses beyond 12 in separate batches without prefetching the whole history", async () => {
  const calls: SessionListInput[] = []
  const api = source(async (input) => {
    calls.push(input)
    return input.cursor ? page(rows(12, 12), "second") : page(rows(0, 12), "first")
  })
  const index = createHomeSessionIndex({ source: () => api })
  await index.refresh()
  expect(index.list()).toHaveLength(12)
  expect(calls).toEqual([{ directory: "/repo", limit: 12, order: "desc" }])
  await index.more()
  expect(index.list()).toHaveLength(24)
  expect(calls[1]).toEqual({ directory: "/repo", limit: 12, order: "desc", cursor: "first" })
  expect(index.hasMore()).toBe(true)
})

test("fills a batch after excluding the current session without losing the next row", async () => {
  const calls: SessionListInput[] = []
  const api = source(async (input) => {
    calls.push(input)
    if (!input.cursor) return page([session("active"), ...rows(0, 11)], "eleven")
    if (input.cursor === "eleven") return page(rows(11, 1), "twelve")
    return page(rows(12, 2))
  })
  const index = createHomeSessionIndex({ source: () => api })
  await index.refresh()
  expect(index.list().map((item) => item.id)).toEqual(rows(0, 12).map((item) => item.id))
  expect(calls[1]).toEqual({ directory: "/repo", limit: 1, order: "desc", cursor: "eleven" })
  await index.more()
  expect(index.list()).toHaveLength(14)
  expect(index.list().at(-1)?.id).toBe("session-13")
  expect(index.hasMore()).toBe(false)
  await index.more()
  expect(calls).toHaveLength(3)
})

test("search goes to the server, finds unloaded history, and retains the query on later pages", async () => {
  const calls: SessionListInput[] = []
  const api = source(async (input) => {
    calls.push(input)
    if (!input.search) return page(rows(0, 12), "browse")
    return input.cursor ? page([session("old-last-match")]) : page(rows(100, 12), "matches")
  })
  const index = createHomeSessionIndex({ source: () => api })
  await index.refresh()
  await index.refresh("  old  ")
  expect(calls[1]).toEqual({ directory: "/repo", limit: 12, order: "desc", search: "old" })
  expect(index.list()[0].id).toBe("session-100")
  await index.more()
  expect(calls[2]).toEqual({ directory: "/repo", limit: 12, order: "desc", search: "old", cursor: "matches" })
  expect(index.list().at(-1)?.id).toBe("old-last-match")
  await index.refresh()
  expect(index.list()).toHaveLength(12)
  expect(calls[3].cursor).toBeUndefined()
  expect(calls[3].search).toBeUndefined()
})

test("deduplicates overlapping pages and continues until 12 new rows are loaded", async () => {
  const api = source(async (input) =>
    input.cursor === "overlap" ? page([session("seen"), ...rows(0, 11)], "last") : page(rows(11, 1)),
  )
  const result = await loadHomeSessionPage(api, { cursor: "overlap", knownIDs: ["seen"] })
  expect(result.items).toHaveLength(12)
  expect(result.items.map((item) => item.id)).toEqual(rows(0, 12).map((item) => item.id))
})

test("exact ID lookup finds old sessions, deduplicates title results, and respects directory scope", async () => {
  const id = "ses_abcdefghijklmnopqrstuvwxyz"
  let directory = "/repo"
  const lookups: string[] = []
  const api = source(
    async () => page([session(id)]),
    async (input) => {
      lookups.push(input.sessionID)
      return session(id, directory)
    },
  )
  expect((await loadHomeSessionPage(api, { search: id })).items.map((item) => item.id)).toEqual([id])
  expect(lookups).toEqual([id])
  directory = "/other"
  api.list = async () => page([])
  expect((await loadHomeSessionPage(api, { search: id })).items).toEqual([])
  const missing = source(async () => page([]))
  expect((await loadHomeSessionPage(missing, { search: id })).items).toEqual([])
})

test("failed next-page requests preserve loaded rows and retry the same cursor", async () => {
  let fail = true
  const cursors: (string | undefined)[] = []
  const api = source(async (input) => {
    cursors.push(input.cursor)
    if (!input.cursor) return page(rows(0, 12), "next")
    if (fail) throw new Error("offline")
    return page(rows(12, 1))
  })
  const index = createHomeSessionIndex({ source: () => api })
  await index.refresh()
  await index.more()
  expect(index.failed()).toBe(true)
  expect(index.list()).toHaveLength(12)
  fail = false
  await index.more()
  expect(index.failed()).toBe(false)
  expect(index.list()).toHaveLength(13)
  expect(cursors).toEqual([undefined, "next", "next"])
})

test("ignores stale responses, aborts replaced searches, and prevents duplicate page loads", async () => {
  const old = Promise.withResolvers<SessionsResponse>()
  const signals: AbortSignal[] = []
  let calls = 0
  const api = source(async (_input, options) => {
    calls++
    signals.push(options!.signal!)
    return calls === 1 ? old.promise : page([session("new-search")])
  })
  const index = createHomeSessionIndex({ source: () => api })
  const first = index.refresh("old")
  await index.more()
  expect(calls).toBe(1)
  await index.refresh("new")
  expect(signals[0].aborted).toBe(true)
  old.resolve(page([session("stale")]))
  await first
  expect(index.list().map((item) => item.id)).toEqual(["new-search"])
  expect(index.failed()).toBe(false)
  expect(index.loading()).toBe(false)
})

test("closing or changing the source prevents an in-flight result from populating the next view", async () => {
  const response = Promise.withResolvers<SessionsResponse>()
  let api = source(async () => response.promise)
  const index = createHomeSessionIndex({ source: () => api })
  const pending = index.refresh()
  index.clear()
  api = source(async () => page([session("other-server")]))
  await index.refresh()
  response.resolve(page([session("old-server")]))
  await pending
  expect(index.list().map((item) => item.id)).toEqual(["other-server"])
})

test("debounces search and cancels scheduled work when clearing the query or closing", async () => {
  const queries: (string | undefined)[] = []
  const api = source(async (input) => {
    queries.push(input.search)
    return page([])
  })
  const index = createHomeSessionIndex({ source: () => api, searchDelay: 5 })
  index.search("one")
  index.search("two")
  expect(index.loading()).toBe(true)
  await Bun.sleep(20)
  expect(queries).toEqual(["two"])
  index.search("three")
  index.search("")
  await Bun.sleep(20)
  expect(queries).toEqual(["two", undefined])
  index.search("four")
  index.clear()
  await Bun.sleep(20)
  expect(queries).toEqual(["two", undefined])
  expect(index.loading()).toBe(false)
})

test("a repeated server cursor fails visibly instead of looping or silently truncating history", async () => {
  const api = source(async () => page([], "same"))
  const index = createHomeSessionIndex({ source: () => api })
  await index.refresh()
  expect(index.failed()).toBe(true)
  expect(index.loading()).toBe(false)
})
