import { expect, test } from "bun:test"
import {
  ATTACHMENT_TIMED_OUT,
  createPreparationState,
  isPreparingAttachments,
  transitionPreparation,
  type PreparationEvent,
} from "./preparation-machine"

const owner = { scope: {}, identity: "session" }

test("choosing does not block sending or expire; selection and file progress own the deadline", () => {
  const choosing = transitionPreparation(createPreparationState(owner), { type: "started", phase: "choosing" })
  expect(choosing.effects).toEqual([])
  expect(isPreparingAttachments(choosing.state)).toBe(false)
  expect(transitionPreparation(choosing.state, { type: "timed-out", attempt: 1, revision: 0 }).state).toBe(
    choosing.state,
  )
  const selected = transitionPreparation(choosing.state, { type: "selected", attempt: 1 })
  expect(isPreparingAttachments(selected.state)).toBe(true)
  expect(selected.effects).toEqual([{ type: "timer", attempt: 1, revision: 1 }])
  expect(transitionPreparation(selected.state, { type: "selected", attempt: 1 }).state).toBe(selected.state)
  const progress = transitionPreparation(selected.state, { type: "progress", attempt: 1 })
  expect(progress.effects).toEqual([{ type: "timer", attempt: 1, revision: 2 }])
  expect(transitionPreparation(progress.state, { type: "timed-out", attempt: 1, revision: 1 }).state).toBe(
    progress.state,
  )
  const expired = transitionPreparation(progress.state, { type: "timed-out", attempt: 1, revision: 2 })
  expect(expired.state.status).toBe("idle")
  expect(expired.effects).toEqual([{ type: "failed", attempt: 1, error: ATTACHMENT_TIMED_OUT }])
})

test.each([
  { type: "succeeded", attempt: 1, added: true },
  { type: "failed", attempt: 1, error: "read failed" },
  { type: "cancelled", attempt: 1 },
] satisfies PreparationEvent[])("$type retires only its operation and rejects repeated completion", (event) => {
  const first = transitionPreparation(createPreparationState(owner), { type: "started", phase: "preparing" }).state
  const second = transitionPreparation(first, { type: "started", phase: "preparing" }).state
  const finished = transitionPreparation(second, event)
  expect(finished.effects).toEqual([event])
  expect(isPreparingAttachments(finished.state)).toBe(true)
  expect(transitionPreparation(finished.state, event).state).toBe(finished.state)
  const last = transitionPreparation(finished.state, { type: "succeeded", attempt: 2, added: false })
  expect(last.state).toEqual({ status: "idle", owner, issued: 2 })
})

test("replacing a draft cancels every gesture, and returning to its former identity cannot revive one", () => {
  const first = transitionPreparation(createPreparationState(owner), { type: "started", phase: "preparing" }).state
  const choosing = transitionPreparation(first, { type: "started", phase: "choosing" }).state
  const replacement = transitionPreparation(choosing, { type: "owner.changed", owner: { ...owner, scope: {} } })
  expect(replacement.effects).toEqual([
    { type: "cancelled", attempt: 1 },
    { type: "cancelled", attempt: 2 },
  ])
  const returned = transitionPreparation(replacement.state, { type: "owner.changed", owner }).state
  const fresh = transitionPreparation(returned, { type: "started", phase: "preparing" }).state
  expect(fresh.issued).toBe(3)
  expect(transitionPreparation(fresh, { type: "succeeded", attempt: 1, added: true }).state).toBe(fresh)
  const cancelled = transitionPreparation(fresh, { type: "cancel-all" })
  expect(cancelled.effects).toEqual([{ type: "cancelled", attempt: 3 }])
  expect(transitionPreparation(cancelled.state, { type: "cancel-all" }).state).toBe(cancelled.state)
})

test("disposal cancels work and permanently closes admission", () => {
  const active = transitionPreparation(createPreparationState(owner), { type: "started", phase: "preparing" }).state
  const disposed = transitionPreparation(active, { type: "disposed" })
  expect(disposed.effects).toEqual([{ type: "cancelled", attempt: 1 }])
  for (const event of [
    { type: "started", phase: "preparing" },
    { type: "failed", attempt: 1, error: "late failure" },
    { type: "owner.changed", owner: { scope: {}, identity: "other" } },
  ] satisfies PreparationEvent[]) {
    expect(transitionPreparation(disposed.state, event).state).toBe(disposed.state)
  }
})
