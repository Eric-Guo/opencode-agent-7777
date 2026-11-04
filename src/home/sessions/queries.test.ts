import { expect, jest, test } from "bun:test"
import type { RecentChat, RecentPage } from "@/nexus/chat"
import type { HomeSessionSource } from "./index"
import { createHomeSessionIndex } from "./queries"

function session(id: string): RecentChat {
  return { id, title: id, time: { created: 1, updated: 1 } }
}
const page = (items: RecentChat[], next: string | null = null): RecentPage => ({ items, next })
const source = (list: HomeSessionSource["list"]): HomeSessionSource => ({ sessionID: "active", list })
const rows = (start: number, count: number) => Array.from({ length: count }, (_, i) => session(`session-${start + i}`))

test("failed next-page requests preserve loaded rows and retry the same cursor", async () => {
  let fail = true
  const cursors: (string | undefined)[] = []
  const api = source(async (cursor) => {
    cursors.push(cursor)
    if (!cursor) return page(rows(0, 12), "next")
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
  const old = Promise.withResolvers<RecentPage>()
  const signals: AbortSignal[] = []
  let calls = 0
  const api = source(async (_cursor, signal) => {
    calls++
    signals.push(signal!)
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
  const response = Promise.withResolvers<RecentPage>()
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

test.each(["success", "failure"])("a late %s cannot settle a reopened search for the same query", async (outcome) => {
  const old = Promise.withResolvers<RecentPage>()
  const latest = Promise.withResolvers<RecentPage>()
  const signals: AbortSignal[] = []
  const api = source(async (_cursor, signal) => {
    signals.push(signal!)
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
  latest.resolve(page([{ ...session("current"), title: "same" }]))
  await second
  expect(index.list().map((item) => item.id)).toEqual(["current"])
  expect(index.loading()).toBe(false)
  expect(signals[1].aborted).toBe(false)
})

test("debounces search and cancels scheduled work when clearing the query or closing", async () => {
  jest.useFakeTimers()
  try {
    const calls: (string | undefined)[] = []
    const api = source(async (cursor) => {
      calls.push(cursor)
      return page([])
    })
    const index = createHomeSessionIndex({ source: () => api })
    index.search("one")
    index.search("two")
    expect(index.loading()).toBe(true)
    expect(calls).toEqual([])
    jest.advanceTimersToNextTimer()
    await Promise.resolve()
    expect(calls).toEqual([undefined])
    index.search("three")
    index.search("")
    jest.runOnlyPendingTimers()
    await Promise.resolve()
    expect(calls).toEqual([undefined, undefined])
    index.search("four")
    index.clear()
    jest.runOnlyPendingTimers()
    expect(calls).toEqual([undefined, undefined])
    expect(index.loading()).toBe(false)
  } finally {
    jest.useRealTimers()
  }
})

test("a repeated server cursor fails visibly instead of looping or silently truncating history", async () => {
  const api = source(async () => page([], "same"))
  const index = createHomeSessionIndex({ source: () => api })
  await index.refresh()
  expect(index.failed()).toBe(true)
  expect(index.loading()).toBe(false)
})
