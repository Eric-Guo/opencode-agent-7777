import { expect, test } from "bun:test"
import { createRefreshState, transitionRefresh } from "./refresh-machine"
test("refresh bursts coalesce and retired attempts cannot settle a follow-up pass", () => {
  const initial = createRefreshState()
  const first = transitionRefresh(initial, { type: "refresh", limit: 36 })
  const repeated = transitionRefresh(first, { type: "refresh", limit: 100 })
  expect(transitionRefresh(repeated, { type: "refresh", limit: 36 })).toBe(repeated)
  const next = transitionRefresh(repeated, { type: "succeeded", attempt: first.attempt })
  expect(next).toEqual({ status: "loading", limit: 36, attempt: 2, again: false })
  expect(transitionRefresh(next, { type: "failed", attempt: first.attempt, error: "old" })).toBe(next)
  expect(transitionRefresh(next, { type: "succeeded", attempt: next.attempt })).toEqual({ status: "idle", attempt: 2 })
  expect(initial).toEqual({ status: "idle", attempt: 0 })
  expect(first).toEqual({ status: "loading", attempt: 1, limit: 36, again: false })
  const disposed = transitionRefresh(next, { type: "disposed" })
  expect(transitionRefresh(disposed, { type: "refresh", limit: 36 })).toBe(disposed)
})
