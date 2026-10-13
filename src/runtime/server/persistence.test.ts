import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createStore, reconcile } from "solid-js/store"
import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import { MODEL_SELECTION_KEY, SESSION_MODEL_SELECTION_KEY } from "@/constants/session"
import {
  readModelConfig,
  writeModelConfig,
  readModelSelection,
  writeModelSelection,
  readSessionModelSelections,
  writeSessionModelSelections,
  type ModelConfig,
} from "./persistence"

const key = "opencode.7777.model.config"
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
  else delete (globalThis as { localStorage?: Storage }).localStorage
})

test.each([undefined, "", "broken", "null"])("recovers independent source defaults from %s", (value) => {
  if (value !== undefined) saved.set(key, value)
  const initial = structuredClone(DEFAULT_MODEL_CONFIG)
  const expected: ModelConfig = {
    user: initial.user,
    disabledProviders: initial.disabledProviders,
    popularProviders: initial.popularProviders,
    recent: [],
  }
  const first = readModelConfig()
  expect(first).toEqual(expected)
  first.user[0].visibility = first.user[0].visibility === "show" ? "hide" : "show"
  first.popularProviders[0].visibility = first.popularProviders[0].visibility === "show" ? "hide" : "show"
  first.disabledProviders.push("another-provider")
  const [store, setStore] = createStore(readModelConfig())
  setStore("user", 0, "visibility", store.user[0].visibility === "show" ? "hide" : "show")
  setStore("popularProviders", reconcile([]))
  expect(readModelConfig()).toEqual(expected)
  expect(DEFAULT_MODEL_CONFIG).toEqual(initial)
})

test.each(["{}", "[]", "false", "0", '\"text\"'])(
  "preserves the legacy partial-config fallback for %s without restoring cleared model overrides",
  (value) => {
    saved.set(key, value)
    expect(readModelConfig()).toEqual({
      user: [],
      disabledProviders: [...DEFAULT_MODEL_CONFIG.disabledProviders],
      popularProviders: [],
      recent: [],
    })
    saved.set(key, JSON.stringify({ disabledProviders: [] }))
    expect(readModelConfig()).toEqual({ user: [], disabledProviders: [], popularProviders: [], recent: [] })
  },
)

test("recovers valid entries and round-trips the existing key and format", () => {
  saved.set(
    key,
    JSON.stringify({
      user: [null, { providerID: "custom", modelID: "one", visibility: "hide" }, { visibility: "show" }],
      disabledProviders: [false, "disabled"],
      popularProviders: [
        { providerID: "openai", visibility: "show" },
        { providerID: "invalid", visibility: true },
      ],
      recent: [
        { providerID: "custom", modelID: "one" },
        { providerID: 3, modelID: "two" },
      ],
      variant: { "custom/one": "default", "custom/two": "high", invalid: null },
    }),
  )
  const expected: ModelConfig = {
    user: [{ providerID: "custom", modelID: "one", visibility: "hide" }],
    disabledProviders: ["disabled"],
    popularProviders: [{ providerID: "openai", visibility: "show" }],
    recent: [{ providerID: "custom", modelID: "one" }],
    variant: { "custom/one": "default", "custom/two": "high" },
  }
  expect(readModelConfig()).toEqual(expected)
  writeModelConfig(readModelConfig())
  expect(JSON.parse(saved.get(key)!)).toEqual(expected)
  const next = readModelConfig()
  next.recent[0].modelID = "edited"
  expect(readModelConfig()).toEqual(expected)
  expect([...saved.keys()]).toEqual([key])
})

test.each([
  { invalid: null, disabled: DEFAULT_MODEL_CONFIG.disabledProviders },
  { invalid: false, disabled: DEFAULT_MODEL_CONFIG.disabledProviders },
  { invalid: "invalid", disabled: DEFAULT_MODEL_CONFIG.disabledProviders },
  { invalid: [], disabled: [] },
  { invalid: { bad: null }, disabled: DEFAULT_MODEL_CONFIG.disabledProviders, variant: {} },
])("recovers invalid fields independently: $invalid", ({ invalid, disabled, variant }) => {
  saved.set(
    key,
    JSON.stringify({
      user: invalid,
      disabledProviders: invalid,
      popularProviders: invalid,
      recent: invalid,
      variant: invalid,
    }),
  )
  expect(readModelConfig()).toEqual({
    user: [],
    disabledProviders: [...disabled],
    popularProviders: [],
    recent: [],
    ...(variant ? { variant } : {}),
  })
})

test("retains extra entry fields and explicit empty identifiers through recovery and writes", () => {
  const expected: ModelConfig = {
    user: [{ providerID: "", modelID: "", visibility: "hide", favorite: true }],
    disabledProviders: [""],
    popularProviders: [{ providerID: "", visibility: "show", label: "saved" }],
    recent: [{ providerID: "", modelID: "", metadata: { label: "saved" } }],
    variant: { "": "", "custom/one": "default" },
  }
  saved.set(key, JSON.stringify({ ...expected, unknown: "ignored" }))
  expect(readModelConfig()).toEqual(expected)
  writeModelConfig(readModelConfig())
  expect(JSON.parse(saved.get(key)!)).toEqual(expected)
})

test("continues with independent defaults when storage is unavailable", () => {
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
  const expected = {
    user: structuredClone(DEFAULT_MODEL_CONFIG.user),
    disabledProviders: [...DEFAULT_MODEL_CONFIG.disabledProviders],
    popularProviders: structuredClone(DEFAULT_MODEL_CONFIG.popularProviders),
    recent: [],
  }
  const value = readModelConfig()
  expect(value).toEqual(expected)
  value.user.length = 0
  expect(readModelConfig()).toEqual(expected)
  expect(() => writeModelConfig(value)).not.toThrow()
})

describe("global model preference storage", () => {
  test.each([
    undefined,
    "",
    "broken",
    "null",
    "[]",
    '"text"',
    "false",
    "{}",
    '{"providerID":"provider"}',
    '{"providerID":"provider","modelID":3}',
  ])("ignores malformed or absent selections: %s", (value) => {
    if (value !== undefined) saved.set(MODEL_SELECTION_KEY, value)
    expect(readModelSelection()).toBeUndefined()
  })

  test("keeps only model identifiers, including empty strings, without changing the storage key", () => {
    saved.set(MODEL_SELECTION_KEY, '{"providerID":"","modelID":"","legacy":true}')
    expect(readModelSelection()).toEqual({ providerID: "", modelID: "" })
    writeModelSelection({ providerID: "provider", modelID: "model" })
    const [store, setStore] = createStore(readModelSelection()!)
    setStore("modelID", "edited")
    expect(store.modelID).toBe("edited")
    expect(readModelSelection()).toEqual({ providerID: "provider", modelID: "model" })
    writeModelSelection(undefined)
    expect(saved.get(MODEL_SELECTION_KEY)).toBe('{"providerID":"provider","modelID":"model"}')
    expect([...saved.keys()]).toEqual([MODEL_SELECTION_KEY])
  })
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

  test.each([
    "null",
    "[]",
    "broken",
    '"text"',
    "false",
    "0",
    '[{"model":{"providerID":"p","modelID":"m"},"variant":null}]',
  ])("ignores malformed storage: %s", (value) => {
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
        badContainer: [],
        badModelContainer: { model: [], variant: null },
        badVariantContainer: { model: { providerID: "provider", modelID: "model" }, variant: [] },
        empty: null,
      }),
    )
    expect(readSessionModelSelections()).toEqual({
      valid: { model: { providerID: "provider", modelID: "model" }, variant: null },
    })
  })

  test("retains legacy fields and literal record keys through writes and isolated Solid edits", () => {
    const json =
      '{"__proto__":{"model":{"providerID":"","modelID":"","legacy":{"label":"model"}},"variant":"","legacy":{"label":"session"}},"constructor":{"model":{"providerID":"p","modelID":"m"},"variant":null}}'
    saved.set(SESSION_MODEL_SELECTION_KEY, json)
    const choices = readSessionModelSelections()
    expect(choices).toEqual(JSON.parse(json))
    const [store, setStore] = createStore({ choice: choices["__proto__"]! })
    setStore("choice", "model", "modelID", "edited")
    setStore("choice", "variant", "high")
    expect(store.choice.model.modelID).toBe("edited")
    expect(readSessionModelSelections()).toEqual(JSON.parse(json))
    writeSessionModelSelections(readSessionModelSelections())
    expect(JSON.parse(saved.get(SESSION_MODEL_SELECTION_KEY)!)).toEqual(JSON.parse(json))
    expect([...saved.keys()]).toEqual([SESSION_MODEL_SELECTION_KEY])
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
    expect(readModelSelection()).toBeUndefined()
    expect(() => writeModelSelection({ providerID: "provider", modelID: "model" })).not.toThrow()
  })
})
