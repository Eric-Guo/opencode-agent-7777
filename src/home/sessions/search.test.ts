import { expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { createHomeSessionsController } from "./controller"
import { createHomeSessionSearchController, searchSessions } from "./search"

function session(id: string, title: string, updated = 1): SessionInfo {
  return {
    id,
    title,
    projectID: "project",
    location: { directory: "/repo" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated },
  }
}

test("searches displayed titles and IDs with trimmed case-insensitive text", () => {
  const source = [session("ses_FIRST", "Build a Widget"), session("ses_second", "天气查询")]
  expect(searchSessions(source, "  WIDGET  ").map((item) => item.id)).toEqual(["ses_FIRST"])
  expect(searchSessions(source, "ses_first").map((item) => item.id)).toEqual(["ses_FIRST"])
  expect(searchSessions(source, "天气").map((item) => item.id)).toEqual(["ses_second"])
  expect(searchSessions(source, "   ")).toEqual(source)
  expect(searchSessions(source, "unmatched")).toEqual([])
  expect(searchSessions([session("new", "New session - 2026-09-22T00:00:00.000Z")], "2026-09")).toEqual([])
})

test("keyboard navigation follows activity order, wraps, and resets after filtering or closing", () => {
  const opened: string[] = []
  const sessions = createHomeSessionsController({
    sessions: () => [session("older", "Older", 1), session("newer", "Newer", 2)],
    loading: () => false,
    switching: () => false,
    open: (item) => opened.push(item.id),
  })
  const search = createHomeSessionSearchController(sessions)
  expect(search.result.active()).toBe("newer")
  search.result.move(-1)
  expect(search.result.active()).toBe("older")
  search.result.move(1)
  expect(search.result.active()).toBe("newer")
  search.query.input("OLDER")
  expect(search.result.active()).toBe("older")
  expect(search.result.selectActive()).toBe(true)
  expect(opened).toEqual(["older"])
  search.query.input("missing")
  search.result.move(1)
  expect(search.result.active()).toBeUndefined()
  expect(search.result.selectActive()).toBe(false)
  search.query.reset()
  expect(search.query.value()).toBe("")
  expect(search.result.active()).toBe("newer")
})

test("a refreshed list cannot leave keyboard selection pointing at a removed row", () => {
  let source = [session("first", "First"), session("second", "Second")]
  let switching = false
  const opened: string[] = []
  const search = createHomeSessionSearchController(
    createHomeSessionsController({
      sessions: () => source,
      loading: () => false,
      switching: () => switching,
      open: (item) => opened.push(item.id),
    }),
  )
  search.result.highlight("second")
  source = [session("first", "First")]
  expect(search.result.active()).toBe("first")
  switching = true
  expect(search.result.selectActive()).toBe(false)
  expect(opened).toEqual([])
  switching = false
  expect(search.result.selectActive()).toBe(true)
  expect(opened).toEqual(["first"])
})
