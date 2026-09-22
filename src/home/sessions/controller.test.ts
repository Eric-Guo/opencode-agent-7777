import { expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { createHomeSessionsController, groupSessions } from "./controller"
import { createHomeSessionIndex } from "./index"

function session(id: string, created: number, updated?: number): SessionInfo {
  return {
    id,
    title: id,
    projectID: "project",
    location: { directory: "/repo" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created, updated: updated ?? created },
  }
}

test("groups by local calendar day using updated time and preserves order within a group", () => {
  const now = new Date(2026, 0, 1, 0, 15)
  const today = new Date(2026, 0, 1, 0, 1).getTime()
  const yesterday = new Date(2025, 11, 31, 23, 59).getTime()
  const older = new Date(2025, 11, 30).getTime()
  const source = [
    session("updated-today", older, today),
    session("today", today),
    session("yesterday", yesterday),
    session("older", older),
  ]
  const original = structuredClone(source)
  expect(
    groupSessions(source, now).map((group) => ({ id: group.id, ids: group.sessions.map((item) => item.id) })),
  ).toEqual([
    { id: "today", ids: ["updated-today", "today"] },
    { id: "yesterday", ids: ["yesterday"] },
    { id: "older", ids: ["older"] },
  ])
  expect(source).toEqual(original)
})

test("omits empty groups and tolerates invalid timestamps", () => {
  expect(groupSessions([])).toEqual([])
  expect(groupSessions([session("old", 1), session("invalid", Number.NaN)], new Date(2026, 8, 22))).toEqual([
    { id: "older", sessions: [session("old", 1), session("invalid", Number.NaN)] },
  ])
})

test("sorts recent sessions by activity without mutating the source", () => {
  const source = [session("first", 1), session("updated", 2, 10), session("newer", 3)]
  const controller = createHomeSessionsController({
    data: { ...createHomeSessionIndex({ source: () => undefined }), list: () => source },
    switching: () => false,
    open: () => {},
  })
  expect(controller.data.list().map((item) => item.id)).toEqual(["updated", "newer", "first"])
  expect(source.map((item) => item.id)).toEqual(["first", "updated", "newer"])
})

test("opens the latest record and rejects stale or duplicate selections while switching", () => {
  const initial = session("selected", 1)
  let source = [initial]
  let switching = false
  const opened: SessionInfo[] = []
  const controller = createHomeSessionsController({
    data: { ...createHomeSessionIndex({ source: () => undefined }), list: () => source },
    switching: () => switching,
    open: (item) => {
      opened.push(item)
      switching = true
    },
  })
  source = [{ ...initial, title: "Renamed session" }]
  expect(controller.session.open(initial)).toBe(true)
  expect(opened.map((item) => item.title)).toEqual(["Renamed session"])
  expect(controller.session.open(initial)).toBe(false)
  switching = false
  source = []
  expect(controller.session.open(initial)).toBe(false)
  expect(opened).toHaveLength(1)
})
