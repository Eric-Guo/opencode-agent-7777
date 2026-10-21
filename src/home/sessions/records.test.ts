import { expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { compareSessionTime, groupSessions, recentSessionDescription, recentSessionTitle } from "./records"

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
  const source = [session("first", 1), session("updated", 2, 10), session("newer", 3), session("tie", 3)]
  expect(source.toSorted(compareSessionTime).map((item) => item.id)).toEqual(["updated", "tie", "newer", "first"])
  expect(source.map((item) => item.id)).toEqual(["first", "updated", "newer", "tie"])
})

test.each([
  ["  A named session  ", "A named session"],
  ["New session - 2026-08-29T07:00:00.000Z", "New session"],
  ["   ", "Active agent"],
  ["", "Active agent"],
])("formats recent title %j with the supplied agent fallback", (title, expected) => {
  expect(recentSessionTitle({ ...session("id", 1), title }, "Active agent")).toBe(expected)
})

test("formats the activity timestamp and falls back to the ID for invalid dates", () => {
  const updated = new Date(2026, 0, 2, 15, 4)
  const display = /^Jan 2(?:,| at) 03:04 PM$/
  expect(recentSessionDescription(session("updated", 1, updated.getTime()), "en-US")).toMatch(display)
  const legacy = { ...session("created", 1), time: { created: updated.getTime() } } as SessionInfo
  expect(recentSessionDescription(legacy, "en-US")).toMatch(display)
  expect(recentSessionDescription(session("invalid", Number.NaN), "en-US")).toBe("invalid")
})
