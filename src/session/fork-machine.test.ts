import { expect, test } from "bun:test"
import { createForkState, transitionFork } from "./fork-machine"

test("one fork owns both confirmations and the write until opening finishes", () => {
  const start = transitionFork(createForkState(), { type: "requested", confirm: true })
  const attempt = start.attempt
  expect(start).toEqual({ status: "confirming-replace", attempt: 1 })
  expect(transitionFork(start, { type: "requested", confirm: false })).toBe(start)
  expect(transitionFork(start, { type: "created", attempt, confirm: false })).toBe(start)
  const creating = transitionFork(start, { type: "approved", attempt })
  expect(creating.status).toBe("creating")
  const changed = transitionFork(creating, { type: "created", attempt, confirm: true })
  expect(changed.status).toBe("confirming-open")
  const opening = transitionFork(changed, { type: "approved", attempt })
  expect(opening.status).toBe("opening")
  expect(transitionFork(opening, { type: "finished", attempt }).status).toBe("idle")
})

test("cancellation, write timeout and disposal retire their own attempt", () => {
  const confirm = transitionFork(createForkState(), { type: "requested", confirm: true })
  const cancelled = transitionFork(confirm, { type: "finished", attempt: confirm.attempt })
  const write = transitionFork(cancelled, { type: "requested", confirm: false })
  const timedOut = transitionFork(write, { type: "finished", attempt: write.attempt })
  const retry = transitionFork(timedOut, { type: "requested", confirm: false })
  expect(retry).toEqual({ status: "creating", attempt: 3 })
  expect(transitionFork(retry, { type: "approved", attempt: confirm.attempt })).toBe(retry)
  expect(transitionFork(retry, { type: "created", attempt: write.attempt, confirm: false })).toBe(retry)
  const disposed = transitionFork(retry, { type: "disposed" })
  expect(disposed.status).toBe("disposed")
  expect(transitionFork(disposed, { type: "created", attempt: retry.attempt, confirm: false })).toBe(disposed)
})
