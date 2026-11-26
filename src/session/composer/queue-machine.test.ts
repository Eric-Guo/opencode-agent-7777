import { expect, test } from "bun:test"
import { createQueueState, queuedPromptRows, transitionQueue, type QueuedPrompt } from "./queue-machine"

test("queue previews count files and presentation cards and retain legacy display text", () => {
  const queued = (id: string, payload: QueuedPrompt["payload"]): QueuedPrompt => ({
    id,
    sessionID: "session",
    type: "user",
    delivery: "queue",
    time: { created: 1 },
    payload,
  })
  const rows = queuedPromptRows([
    queued("mixed", {
      text: "Full prompt",
      files: [{ name: "src/index.ts", mime: "text/plain", data: "", source: { type: "inline" } }],
      metadata: {
        displayText: "Review these",
        attachments: [{ name: "notes.csv", path: "/work/notes.csv", mime: "text/csv" }, { name: "incomplete" }],
        comments: [
          { path: "src/index.ts", comment: "Inspect this line" },
          { type: "quote", text: "Earlier reply" },
          { type: "note", label: "Console", icon: "terminal", comment: "Inspect output" },
          { type: "browser", element: { selector: "#save", label: "Save" }, comment: "Inspect button" },
          { type: "note", label: "Missing icon" },
        ],
      },
    }),
    queued("legacy", { text: "Full prompt", metadata: { displayText: "Older preview" } }),
    queued("empty", { text: "Full prompt", metadata: { displayText: "", comments: [] } }),
  ])
  expect(rows).toEqual([
    { id: "mixed", text: "Review these", attachments: 5 },
    { id: "legacy", text: "Older preview", attachments: 0 },
    { id: "empty", text: "Full prompt", attachments: 0 },
  ])
})

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
