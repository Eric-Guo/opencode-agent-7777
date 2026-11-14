import { expect, test } from "bun:test"
import { OpenCode } from "@opencode/client/promise"
import type { SessionExportData } from "./export"
import { createSessionExportState, transitionSessionExport } from "./export-machine"

test("an expired fetch cannot save or dismiss the next export, including transports that ignore abort", () => {
  const request = {
    type: "requested",
    target: { sessionID: "session", api: OpenCode.make({ baseUrl: "http://fixture.local" }) },
  } as const
  const first = transitionSessionExport(createSessionExportState(), request).state
  expect(transitionSessionExport(first, request).state).toBe(first)
  expect(transitionSessionExport(first, { type: "saved", attempt: 1, filename: "premature" }).state).toBe(first)
  const timeout = transitionSessionExport(first, { type: "timed-out", attempt: 1 })
  expect(timeout.effects).toEqual([{ type: "timed-out" }])
  const retry = transitionSessionExport(timeout.state, request).state
  // Deliberately unusable data proves a stale result is rejected before any save effect runs.
  const late = { type: "fetched", attempt: 1, data: {} as SessionExportData } as const
  expect(transitionSessionExport(retry, late)).toEqual({ state: retry, effects: [] })
  expect(transitionSessionExport(retry, { type: "failed", attempt: 1, error: "old" }).state).toBe(retry)
  const disposed = transitionSessionExport(retry, { type: "disposed" }).state
  expect(transitionSessionExport(disposed, late)).toEqual({ state: { status: "disposed" }, effects: [] })
})
