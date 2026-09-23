import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { SESSION_MODEL_SELECTION_KEY } from "@/constants/session"
import {
  readSessionModelSelections,
  writeSessionModelSelections,
  readSessionRecord,
  writeSessionRecord,
} from "./storage-compact"

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
  else delete (globalThis as { localStorage?: typeof globalThis.localStorage }).localStorage
})

test("configured session keys preserve existing 7777 data and isolate another agent", () => {
  saved.set("opencode.7777.session.id", "legacy-session")
  saved.set("opencode.7777.session.directory", "/legacy")
  expect(readSessionRecord()).toEqual({ id: "legacy-session", directory: "/legacy" })
  const keys = { sessionID: "other.session", sessionDirectory: "other.directory", promptDraft: "other.draft" }
  expect(readSessionRecord(keys)).toBeUndefined()
  writeSessionRecord(
    {
      id: "other-session",
      projectID: "project",
      location: { directory: "/other" },
      title: "Other session",
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 1 },
    },
    keys,
  )
  expect(readSessionRecord(keys)).toEqual({ id: "other-session", directory: "/other" })
  expect(saved.get("other.session")).toBe("other-session")
  expect(saved.get("other.directory")).toBe("/other")
  expect(readSessionRecord()).toEqual({ id: "legacy-session", directory: "/legacy" })
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
