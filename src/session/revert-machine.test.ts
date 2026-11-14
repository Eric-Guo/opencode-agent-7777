import { expect, test } from "bun:test"
import { createSessionRevertState, transitionSessionRevert, type SessionRevertEvent } from "./revert-machine"

const request = {
  type: "requested",
  operation: { messageID: "msg_1", originalParts: [], originalDraft: "{}" },
} satisfies SessionRevertEvent

test.each([false, true])("timeout reconciles only an unconfirmed mutation (confirmed: %s)", (confirmed) => {
  const initial = createSessionRevertState()
  const running = transitionSessionRevert(initial, request).state
  expect(transitionSessionRevert(running, { type: "refreshed", attempt: 1 }).state).toBe(running)
  const state = confirmed
    ? transitionSessionRevert(running, { type: "succeeded", attempt: 1, result: { messageID: "msg_1" } }).state
    : running
  const timeout = transitionSessionRevert(state, { type: "timed-out", attempt: 1 })
  expect(timeout.effects).toEqual(confirmed ? [{ type: "timed-out" }] : [{ type: "timed-out" }, { type: "reconcile" }])
  const retry = transitionSessionRevert(timeout.state, request).state
  expect(transitionSessionRevert(retry, { type: "succeeded", attempt: 1, result: { messageID: "old" } }).state).toBe(
    retry,
  )
  expect(transitionSessionRevert(retry, { type: "failed", attempt: 1, error: "old" }).state).toBe(retry)
  const disposed = transitionSessionRevert(retry, { type: "disposed" }).state
  expect(transitionSessionRevert(disposed, request).state).toBe(disposed)
  expect(initial).toEqual({ status: "idle", attempt: 0 })
})
