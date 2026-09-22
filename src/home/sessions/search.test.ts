import { expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { createHomeSessionsController } from "./controller"
import { createHomeSessionIndex } from "./index"
import { createHomeSessionSearchController } from "./search"

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

test("keyboard navigation follows loaded results and forwards queries to the history index", () => {
  const opened: string[] = []
  const queries: string[] = []
  let source = [session("older", "Older", 1), session("newer", "Newer", 2)]
  const sessions = createHomeSessionsController({
    data: {
      ...createHomeSessionIndex({ source: () => undefined }),
      list: () => source,
      search: (value) => {
        queries.push(value)
      },
    },
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
  expect(queries).toEqual(["OLDER"])
  source = [session("older", "Older")]
  expect(search.result.active()).toBe("older")
  expect(search.result.selectActive()).toBe(true)
  expect(opened).toEqual(["older"])
  source = []
  search.result.move(1)
  expect(search.result.active()).toBeUndefined()
  expect(search.result.selectActive()).toBe(false)
  search.query.reset()
  expect(search.query.value()).toBe("")
  expect(queries).toEqual(["OLDER"])
})

test("a refreshed list cannot leave keyboard selection pointing at a removed row", () => {
  let source = [session("first", "First"), session("second", "Second")]
  let switching = false
  const opened: string[] = []
  const search = createHomeSessionSearchController(
    createHomeSessionsController({
      data: { ...createHomeSessionIndex({ source: () => undefined }), list: () => source },
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
