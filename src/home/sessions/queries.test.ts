import { afterEach, expect, jest, test } from "bun:test"
import type { SessionInfo, SessionListInput, SessionsResponse } from "@opencode/client/promise"
import { loadHomeSessionPage, type HomeSessionSource } from "./index"
import { createHomeSessionIndex } from "./queries"

afterEach(() => jest.useRealTimers())

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

test.each(["/repo/agent7777/agent7777", "/", "C:\\"])(
  "preserves the stored directory when browsing and searching %s",
  async (directory) => {
    const id = "ses_abcdefghijklmnopqrstuvwxyz"
    const calls: SessionListInput[] = []
    const api: HomeSessionSource = {
      directory,
      sessionID: "active",
      list: async (input) => {
        calls.push(input)
        return page([session("same-directory", directory)])
      },
      get: async () => session(id, "/repo/agent7777"),
    }

    const result = await loadHomeSessionPage(api, { search: id })

    expect(calls).toEqual([{ directory, limit: 12, order: "desc", search: id }])
    expect(result.items.map((item) => item.id)).toEqual(["same-directory"])
  },
)

test.each([
  ["C:\\Work\\Agent", "c:/work/agent/"],
  ["\\\\Server\\Share\\Agent", "//server/share/agent/"],
  ["/work/Agent/", "/work/Agent"],
])("browses and looks up sessions in equivalent spellings of %s", async (directory, reported) => {
  const id = "ses_abcdefghijklmnopqrstuvwxyz"
  const api: HomeSessionSource = {
    directory,
    sessionID: "active",
    list: async (input) => {
      expect(input.directory).toBe(directory)
      return input.search ? page([]) : page([session("listed", reported)])
    },
    get: async () => session(id, reported),
  }
  expect((await loadHomeSessionPage(api)).items).toEqual([session("listed", reported)])
  expect((await loadHomeSessionPage(api, { search: id })).items).toEqual([session(id, reported)])
})

test("excludes different POSIX directories from recent sessions and exact lookup", async () => {
  const id = "ses_abcdefghijklmnopqrstuvwxyz"
  const api = source(
    async () => page([session("child", "/repo/sub"), session("sibling", "/repo-2"), session("current-dir", "/repo")]),
    async () => session(id, "/Repo"),
  )
  expect((await loadHomeSessionPage(api, { search: id })).items.map((item) => item.id)).toEqual(["current-dir"])
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

test("a stalled exact-ID lookup times out and a retry ignores the late match", async () => {
  jest.useFakeTimers()
  const id = "ses_abcdefghijklmnopqrstuvwxyz"
  const held = Promise.withResolvers<SessionInfo>()
  const signals: AbortSignal[] = []
  const api = source(
    async () => page([]),
    async (input, options) => {
      expect(input.sessionID).toBe(id)
      signals.push(options!.signal!)
      return signals.length === 1 ? held.promise : session(id)
    },
  )
  const index = createHomeSessionIndex({ source: () => api })
  const first = index.refresh(id)
  jest.advanceTimersByTime(30_000)
  expect(signals[0].aborted).toBe(true)
  await first
  expect(index.failed()).toBe(true)
  expect(index.loading()).toBe(false)
  await index.more()
  held.resolve(session("late-match"))
  await held.promise
  expect(index.list().map((item) => item.id)).toEqual([id])
})

test.each(["list", "lookup"])("a failed %s cancels the other read in an exact-ID search", async (failed) => {
  const id = "ses_abcdefghijklmnopqrstuvwxyz"
  const error = new Error("offline")
  const signals: AbortSignal[] = []
  function read<T>(kind: string, signal: AbortSignal) {
    signals.push(signal)
    return kind === failed ? Promise.reject<T>(error) : new Promise<T>(() => {})
  }
  const api = source(
    (_, options) => read<SessionsResponse>("list", options!.signal!),
    (_, options) => read<SessionInfo>("lookup", options!.signal!),
  )
  await expect(loadHomeSessionPage(api, { search: id })).rejects.toThrow("offline")
  expect(signals).toHaveLength(2)
  expect(signals.every((signal) => signal.aborted)).toBe(true)
})

test("one deadline spans cursor backfill and retry starts at the last published cursor", async () => {
  jest.useFakeTimers()
  const partial = Promise.withResolvers<SessionsResponse>()
  const backfill = Promise.withResolvers<AbortSignal>()
  const stalled = Promise.withResolvers<SessionsResponse>()
  const cursors: (string | undefined)[] = []
  const api = source(async (input, options) => {
    expect(input.search).toBe("old")
    cursors.push(input.cursor)
    if (!input.cursor) return page(rows(0, 12), "next")
    if (input.cursor === "overlap") {
      backfill.resolve(options!.signal!)
      return stalled.promise
    }
    return cursors.length === 2 ? partial.promise : page([session("retried")])
  })
  const index = createHomeSessionIndex({ source: () => api })
  await index.refresh("old")
  const loading = index.more()
  jest.advanceTimersByTime(25_000)
  partial.resolve(page([session("partial")], "overlap"))
  const signal = await backfill.promise
  jest.advanceTimersByTime(5_000)
  expect(signal.aborted).toBe(true)
  await loading
  expect(index.failed()).toBe(true)
  expect(index.list().map((item) => item.id)).toEqual(rows(0, 12).map((item) => item.id))
  await index.more()
  stalled.resolve(page([session("stale")]))
  await stalled.promise
  expect(cursors).toEqual([undefined, "next", "overlap", "next"])
  expect(index.list().at(-1)?.id).toBe("retried")
  expect(index.list()).toHaveLength(13)
  expect(index.failed()).toBe(false)
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
  await first
  old.resolve(page([session("stale")]))
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
  await pending
  api = source(async () => page([session("other-server")]))
  await index.refresh()
  response.resolve(page([session("old-server")]))
  await response.promise
  expect(index.list().map((item) => item.id)).toEqual(["other-server"])
})

test.each(["success", "failure"])("a late %s cannot settle a reopened search for the same query", async (outcome) => {
  const old = Promise.withResolvers<SessionsResponse>()
  const latest = Promise.withResolvers<SessionsResponse>()
  const signals: AbortSignal[] = []
  const api = source(async (_input, options) => {
    signals.push(options!.signal!)
    return signals.length === 1 ? old.promise : latest.promise
  })
  const index = createHomeSessionIndex({ source: () => api })
  const first = index.refresh("same")
  index.clear()
  const second = index.refresh("same")
  expect(signals[0].aborted).toBe(true)
  if (outcome === "success") old.resolve(page([session("obsolete")], "obsolete-cursor"))
  else old.reject(new Error("obsolete failure"))
  await first
  expect(index.list()).toEqual([])
  expect(index.loading()).toBe(true)
  expect(index.failed()).toBe(false)
  expect(index.hasMore()).toBe(false)
  await index.more()
  expect(signals).toHaveLength(2)
  latest.resolve(page([session("current")]))
  await second
  expect(index.list().map((item) => item.id)).toEqual(["current"])
  expect(index.loading()).toBe(false)
  expect(signals[1].aborted).toBe(false)
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
