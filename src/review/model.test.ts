import { expect, test } from "bun:test"
import type { FileDiffInfo, OpenCodeEvent } from "@opencode/client/promise"
import { createReviewModel } from "./model"

const diffs = (): FileDiffInfo[] => [
  { file: "notes.txt", patch: "@@ -1 +1 @@\n-before\n+after\n", additions: 1, deletions: 1, status: "modified" },
]

function fixture() {
  const abort = new AbortController()
  const calls: {
    input: { sessionID: string; context?: number }
    signal?: AbortSignal
    response: ReturnType<typeof Promise.withResolvers<FileDiffInfo[]>>
  }[] = []
  const model = createReviewModel({
    sessionID: "session",
    signal: abort.signal,
    client: {
      session: {
        diff(input, options) {
          const response = Promise.withResolvers<FileDiffInfo[]>()
          calls.push({ input, signal: options?.signal, response })
          return response.promise
        },
      },
    },
  })
  return { model, calls, abort }
}

test("review is demand-loaded and requests bounded patches for the captured session", async () => {
  const { model, calls } = fixture()
  expect(calls).toHaveLength(0)
  const pending = model.refresh()
  expect(model.state.loading).toBe(true)
  expect(calls[0].input).toEqual({ sessionID: "session", context: 3 })
  calls[0].response.resolve(diffs())
  await pending
  expect(model.state.diffs).toEqual(diffs())
  expect(model.state.loading).toBe(false)
  expect(model.state.error).toBeUndefined()
})

test.each([false, true])("a newer review read wins over a late response (failed=%s)", async (failed) => {
  const { model, calls } = fixture()
  const old = model.refresh()
  const next = model.refresh()
  expect(calls[0].signal?.aborted).toBe(true)
  calls[1].response.resolve([])
  await next
  if (failed) calls[0].response.reject(new Error("old failure"))
  else calls[0].response.resolve(diffs())
  await old
  expect(model.state.diffs).toEqual([])
  expect(model.state.loading).toBe(false)
  expect(model.state.error).toBeUndefined()
})

test.each(["close", "activation"])("%s aborts reads and prevents later refreshes", async (reason) => {
  const { model, calls, abort } = fixture()
  const pending = model.refresh()
  if (reason === "close") model.dispose()
  else abort.abort()
  expect(calls[0].signal?.aborted).toBe(true)
  calls[0].response.resolve(diffs())
  await pending
  await model.refresh()
  expect(calls).toHaveLength(1)
  expect(model.state.diffs).toEqual([])
  expect(model.state.error).toBeUndefined()
})

test("a failed read can be retried, including a valid empty result", async () => {
  const { model, calls } = fixture()
  const failed = model.refresh()
  calls[0].response.reject(new Error("offline"))
  await failed
  expect(model.state.error).toEqual(new Error("offline"))
  expect(model.state.loading).toBe(false)
  const retry = model.refresh()
  expect(model.state.error).toBeUndefined()
  calls[1].response.resolve([])
  await retry
  expect(model.state.diffs).toEqual([])
  expect(model.state.loading).toBe(false)
})

test("review refreshes on reconnect, completion and revert, excluding other sessions and streaming deltas", () => {
  const { model, calls } = fixture()
  const event = (type: OpenCodeEvent["type"], sessionID = "session") =>
    ({ type, id: "event", created: 1, data: { sessionID } }) as OpenCodeEvent
  model.event(event("session.text.delta"))
  model.event(event("session.execution.succeeded", "other"))
  expect(calls).toHaveLength(0)
  for (const type of [
    "server.connected",
    "session.execution.succeeded",
    "session.execution.failed",
    "session.execution.interrupted",
    "session.revert.staged",
    "session.revert.cleared",
    "session.revert.committed",
  ] as const) {
    model.event(event(type))
  }
  expect(calls).toHaveLength(7)
  model.dispose()
  model.event(event("server.connected"))
  expect(calls).toHaveLength(7)
  expect(calls.every((call) => call.signal?.aborted)).toBe(true)
})
