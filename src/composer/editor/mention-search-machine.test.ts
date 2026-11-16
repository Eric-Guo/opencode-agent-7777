import { expect, test } from "bun:test"
import {
  INITIAL_MENTION_SEARCH_STATE,
  selectMentionFiles,
  selectMentionSearchStatus,
  transitionMentionSearch,
  type MentionSearchState,
} from "./mention-search-machine"

const owner = Object.freeze({})
const items = Object.freeze([{ id: "file:src.ts", kind: "file" as const, label: "src.ts" }])
const changed = (state: MentionSearchState, query = "src", target: unknown = owner) =>
  transitionMentionSearch(state, { type: "context.changed", owner: target, query })
const started = () => {
  const state = changed(INITIAL_MENTION_SEARCH_STATE).state
  return transitionMentionSearch(state, { type: "debounce.fired", attempt: 1, owner }).state
}

test("replacement debounces cancel earlier attempts and settled rows belong to one owner and query", () => {
  const first = changed(INITIAL_MENTION_SEARCH_STATE)
  expect(first.effects).toEqual([{ type: "debounce", attempt: 1, owner }])
  expect(selectMentionSearchStatus(first.state, owner, "src")).toBe("loading")
  expect(changed(first.state).state).toBe(first.state)
  const next = changed(first.state, "next")
  expect(next.effects).toEqual([
    { type: "cancel", attempt: 1 },
    { type: "debounce", attempt: 2, owner },
  ])
  expect(transitionMentionSearch(next.state, { type: "debounce.fired", attempt: 1, owner }).state).toBe(next.state)
  const loading = transitionMentionSearch(next.state, { type: "debounce.fired", attempt: 2, owner })
  expect(loading.effects).toEqual([{ type: "search", attempt: 2, owner, query: "next" }])
  const ready = transitionMentionSearch(loading.state, { type: "resolved", attempt: 2, owner, items })
  expect(selectMentionFiles(ready.state, owner, "next")).toEqual([{ id: "file:src.ts", kind: "file", label: "src.ts" }])
  expect(selectMentionFiles(ready.state, {}, "next")).toEqual([])
  expect(selectMentionFiles(ready.state, owner, "src")).toEqual([])
  expect(selectMentionFiles(changed(ready.state, "new").state, owner, "new")).toEqual([])
  expect(ready.effects).toEqual([{ type: "cancel", attempt: 2 }])
  expect(INITIAL_MENTION_SEARCH_STATE).toEqual({ status: "closed", issued: 0 })
  expect(Object.isFrozen(INITIAL_MENTION_SEARCH_STATE)).toBe(true)
})

test.each(["failed", "timed-out"] as const)(
  "%s settles once, rejects late results and retries only after a new opening or query",
  (type) => {
    const loading = started()
    const result = transitionMentionSearch(loading, { type, attempt: 1, owner })
    expect(selectMentionSearchStatus(result.state, owner, "src")).toBe("failed")
    expect(selectMentionFiles(result.state, owner, "src")).toEqual([])
    expect(result.effects).toEqual([{ type: "cancel", attempt: 1 }])
    expect(transitionMentionSearch(result.state, { type: "resolved", attempt: 1, owner, items }).state).toBe(
      result.state,
    )
    expect(changed(result.state).state).toBe(result.state)
    const closed = transitionMentionSearch(result.state, { type: "context.closed" }).state
    expect(changed(closed).effects).toEqual([{ type: "debounce", attempt: 2, owner }])
  },
)

test("empty queries, owner replacement, closing and disposal retire pending work", () => {
  const loading = started()
  const replacement = {}
  const next = changed(loading, "src", replacement)
  expect(next.effects).toEqual([
    { type: "cancel", attempt: 1 },
    { type: "debounce", attempt: 2, owner: replacement },
  ])
  for (const attempt of [1, 2])
    expect(transitionMentionSearch(next.state, { type: "resolved", attempt, owner, items }).state).toBe(next.state)
  const empty = changed(next.state, "", replacement)
  expect(empty.effects).toEqual([{ type: "cancel", attempt: 2 }])
  expect(selectMentionSearchStatus(empty.state, replacement, "")).toBe("ready")
  expect(selectMentionFiles(empty.state, replacement, "")).toEqual([])
  for (const type of ["context.closed", "disposed"] as const) {
    const result = transitionMentionSearch(loading, { type })
    expect(result.effects).toEqual([{ type: "cancel", attempt: 1 }])
    expect(transitionMentionSearch(result.state, { type: "resolved", attempt: 1, owner, items }).state).toBe(
      result.state,
    )
    if (type === "disposed") expect(changed(result.state).state).toBe(result.state)
  }
})
