import { afterEach, beforeEach, expect, test } from "bun:test"
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
  expect(readModelConfig()).toEqual(expected)
  expect(DEFAULT_MODEL_CONFIG).toEqual(initial)
})

test("preserves the legacy partial-config fallback without restoring cleared model overrides", () => {
  saved.set(key, "{}")
  expect(readModelConfig()).toEqual({
    user: [],
    disabledProviders: [...DEFAULT_MODEL_CONFIG.disabledProviders],
    popularProviders: [],
    recent: [],
  })
  saved.set(key, JSON.stringify({ disabledProviders: [] }))
  expect(readModelConfig()).toEqual({ user: [], disabledProviders: [], popularProviders: [], recent: [] })
})

test("recovers valid entries and round-trips the existing key and format", () => {
  saved.set(
    key,
    JSON.stringify({
      user: [null, { providerID: "custom", modelID: "one", visibility: "hide" }, { visibility: "show" }],
      disabledProviders: [false, "disabled"],
      popularProviders: [{ providerID: "openai", visibility: "show" }, { providerID: "invalid", visibility: true }],
      recent: [{ providerID: "custom", modelID: "one" }, { providerID: 3, modelID: "two" }],
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
