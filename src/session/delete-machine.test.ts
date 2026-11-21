import { expect, test } from "bun:test"
import { createSessionDeleteState, transitionSessionDelete } from "./delete-machine"

test("only a fresh confirmation starts a delete and only its own missing session counts as deleted", () => {
  const initial = createSessionDeleteState("selected")
  const pending = transitionSessionDelete(initial, { type: "started" })
  expect(initial).toEqual({ status: "idle", attempt: 0, sessionID: "selected" })
  expect(pending).toEqual({ status: "loading", attempt: 1, sessionID: "selected" })
  expect(transitionSessionDelete(pending, { type: "started" })).toBe(pending)

  const error = { _tag: "SessionNotFoundError", sessionID: "other" }
  const failed = transitionSessionDelete(pending, { type: "failed", attempt: 1, error })
  expect(failed).toEqual({ status: "failed", attempt: 1, sessionID: "selected", error })
  const retry = transitionSessionDelete(failed, { type: "started" })
  expect(retry).toEqual({ status: "loading", attempt: 2, sessionID: "selected" })

  const missing = { _tag: "SessionNotFoundError", sessionID: "selected" }
  expect(transitionSessionDelete(retry, { type: "failed", attempt: 1, error: missing })).toBe(retry)
  const deleted = transitionSessionDelete(retry, { type: "failed", attempt: 2, error: missing })
  expect(deleted).toEqual({ status: "ready", attempt: 2, sessionID: "selected" })
  expect(transitionSessionDelete(deleted, { type: "started" })).toBe(deleted)
})

test("disposing the screen retires the pending deletion", () => {
  const pending = transitionSessionDelete(createSessionDeleteState("selected"), { type: "started" })
  const disposed = transitionSessionDelete(pending, { type: "disposed" })
  expect(disposed).toEqual({ status: "disposed", attempt: 1, sessionID: "selected" })
  expect(transitionSessionDelete(disposed, { type: "succeeded", attempt: 1 })).toBe(disposed)
  expect(transitionSessionDelete(disposed, { type: "started" })).toBe(disposed)
})
