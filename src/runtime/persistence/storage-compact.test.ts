import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { SESSION_MODEL_SELECTION_KEY } from "@/constants/session"
import { readSessionModelSelections, writeSessionModelSelections } from "./storage-compact"

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const saved = new Map<string, string>()

beforeEach(() => {
  saved.clear()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  })
})
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original)
  else Reflect.deleteProperty(globalThis, "localStorage")
})

describe("session model preference storage", () => {
  test("round-trips independent session choices and Default without sharing mutable values", () => {
    writeSessionModelSelections({
      first: { model: { providerID: "provider", modelID: "model" }, variant: "high" },
      second: { model: { providerID: "provider", modelID: "model" }, variant: null },
      cleared: undefined,
    })
    const value = readSessionModelSelections()
    expect(value).toEqual({
      first: { model: { providerID: "provider", modelID: "model" }, variant: "high" },
      second: { model: { providerID: "provider", modelID: "model" }, variant: null },
    })
    value.first!.model.modelID = "mutated"
    expect(readSessionModelSelections().first?.model.modelID).toBe("model")
  })

  test.each(["null", "[]", "broken", '"text"'])("ignores malformed storage: %s", (value) => {
    saved.set(SESSION_MODEL_SELECTION_KEY, value)
    expect(readSessionModelSelections()).toEqual({})
  })

  test("drops invalid entries while retaining explicit Default", () => {
    saved.set(
      SESSION_MODEL_SELECTION_KEY,
      JSON.stringify({
        valid: { model: { providerID: "provider", modelID: "model" }, variant: null },
        missing: {},
        badModel: { model: { providerID: 3, modelID: "model" }, variant: "high" },
        badVariant: { model: { providerID: "provider", modelID: "model" }, variant: false },
        noVariant: { model: { providerID: "provider", modelID: "model" } },
        empty: null,
      }),
    )
    expect(readSessionModelSelections()).toEqual({
      valid: { model: { providerID: "provider", modelID: "model" }, variant: null },
    })
  })

  test("keeps storage failures nonfatal", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem() {
          throw new Error("unavailable")
        },
        setItem() {
          throw new Error("quota")
        },
      },
    })
    expect(readSessionModelSelections()).toEqual({})
    expect(() => writeSessionModelSelections({})).not.toThrow()
  })
})
