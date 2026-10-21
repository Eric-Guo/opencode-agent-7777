import { expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { createHomeSessionsController } from "./controller"
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
