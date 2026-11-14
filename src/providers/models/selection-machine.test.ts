import { expect, test } from "bun:test"
import { createModelSelectionState, transitionModelSelection } from "./selection-machine"
const choice = (variant: string | null) => ({ model: { providerID: "provider", modelID: "model" }, variant })
test("an expired or cancelled acknowledgement retains newer choices and cannot retire a subsequent commit", () => {
  const initial = createModelSelectionState({ scope: choice("high") })
  const first = transitionModelSelection(initial, { type: "tracked", key: "scope", expected: choice("high") })
  const edited = transitionModelSelection(first, { type: "edited", key: "scope", choice: choice(null) })
  const acknowledged = transitionModelSelection(edited, { type: "reconciled", key: "scope", durable: choice("high") })
  expect(acknowledged.entries.scope).toEqual({ status: "override", choice: choice(null) })
  const second = transitionModelSelection(edited, { type: "tracked", key: "scope", expected: choice(null) })
  expect(transitionModelSelection(second, { type: "cancelled", key: "scope", attempt: first.attempt })).toBe(second)
  expect(
    transitionModelSelection(second, { type: "cancelled", key: "scope", attempt: second.attempt }).entries.scope,
  ).toEqual({ status: "override", choice: choice(null) })
  expect(initial.entries.scope).toEqual({ status: "override", choice: choice("high") })
})
