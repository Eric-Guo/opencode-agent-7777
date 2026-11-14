import { expect, test } from "bun:test"
import { createQueueState, transitionQueue } from "./queue-machine"

test.each(["cancelled", "delivered"] as const)("%s settles Undo once without guessing from snapshots", (type) => {
  const initial = createQueueState()
  const running = transitionQueue(initial, { type: "requested", operation: { id: "queued", action: "undo" } }).state
  const settled = transitionQueue(running, { type, attempt: 1 })
  expect(settled.state).toEqual({ status: "idle", attempt: 1 })
  expect(settled.effects.map((effect) => effect.type)).toEqual(
    type === "cancelled" ? ["apply", "refresh"] : ["refresh"],
  )
  expect(transitionQueue(settled.state, { type: "succeeded", attempt: 1 })).toEqual({
    state: settled.state,
    effects: [],
  })
  expect(initial).toEqual({ status: "idle", attempt: 0 })
})

test("a retired attempt cannot settle a new operation, and disposal rejects requests", () => {
  const event = { type: "requested", operation: { id: "queued", action: "remove" } } as const
  const first = transitionQueue(createQueueState(), event).state
  expect(transitionQueue(first, event).state).toBe(first)
  const reset = transitionQueue(first, { type: "reset" }).state
  const second = transitionQueue(reset, event).state
  expect(transitionQueue(second, { type: "failed", attempt: 1, error: "old" }).state).toBe(second)
  expect(transitionQueue(second, { type: "succeeded", attempt: 1 }).state).toBe(second)
  const disposed = transitionQueue(second, { type: "disposed" }).state
  expect(transitionQueue(disposed, event)).toEqual({ state: { status: "disposed" }, effects: [] })
})
