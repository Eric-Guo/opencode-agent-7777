import { expect, test } from "bun:test"
import { createNotificationState, pendingNotification, transitionNotification } from "./machine"

test.each(["reset", "forgotten"] as const)("%s retires an attempt without reusing its ID", (type) => {
  const key = "request"
  const empty = createNotificationState()
  const old = transitionNotification(empty, { type: "requested", key })
  const retired = transitionNotification(old, { type, key })
  const next = transitionNotification(retired, { type: "requested", key })

  expect(pendingNotification(empty, key)).toBeUndefined()
  expect(pendingNotification(old, key)).toBe(1)
  expect(pendingNotification(retired, key)).toBeUndefined()
  expect(pendingNotification(next, key)).toBe(2)
  expect(transitionNotification(next, { type: "finished", key, attempt: 1 })).toBe(next)

  const finished = transitionNotification(next, { type: "finished", key, attempt: 2 })
  expect(pendingNotification(next, key)).toBe(2)
  expect(pendingNotification(finished, key)).toBeUndefined()
  expect(transitionNotification(finished, { type: "requested", key })).toBe(finished)
})

test("disposal retires pending deliveries and blocks subsequent requests", () => {
  const key = "request"
  const pending = transitionNotification(createNotificationState(), { type: "requested", key })
  const disposed = transitionNotification(pending, { type: "disposed" })
  expect(pendingNotification(disposed, key)).toBeUndefined()
  expect(transitionNotification(disposed, { type: "finished", key, attempt: 1 })).toBe(disposed)
  expect(transitionNotification(disposed, { type: "requested", key })).toBe(disposed)
})
