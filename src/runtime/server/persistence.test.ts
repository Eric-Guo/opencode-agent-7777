import { afterEach, beforeEach, expect, test } from "bun:test"
import { createStore, reconcile } from "solid-js/store"
import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import { readModelConfig, writeModelConfig, type ModelConfig } from "./persistence"

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
