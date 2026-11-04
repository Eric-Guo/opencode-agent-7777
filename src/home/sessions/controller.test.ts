import { expect, test } from "bun:test"
import type { RecentChat as SessionInfo } from "@/nexus/chat"
import { createHomeSessionsController } from "./controller"
import { createHomeSessionIndex } from "./queries"

function session(id: string, created: number, updated?: number): SessionInfo {
  return {
    id,
    title: id,
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
