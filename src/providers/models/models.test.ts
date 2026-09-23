import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { DEFAULT_MODEL_CONFIG } from "./default-config"
import { createModelsController, modelOptions } from "./models"
import type { ModelInfo } from "@opencode/client/promise"
import { normalizeProviderList } from "@/runtime/server/global-sync/utils"

const key = "opencode.7777.model.config"
const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
let saved = new Map<string, string>()

beforeEach(() => {
  saved = new Map()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  })
})

afterEach(() => {
  if (storage) Object.defineProperty(globalThis, "localStorage", storage)
  else delete (globalThis as { localStorage?: typeof globalThis.localStorage }).localStorage
})

function model(providerID: string, modelID: string, input: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id: modelID,
    providerID,
    modelID,
    name: modelID,
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    variants: [],
    time: { released: 1 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 1000, output: 100 },
    ...input,
  }
}

function options(models = [model("openai", "one"), model("openai", "two"), model("custom", "one")]) {
  return modelOptions(
    normalizeProviderList(
      [
        { id: "openai", name: "OpenAI", activation: "auto", package: "@ai-sdk/openai" },
        { id: "custom", name: "Custom", activation: "auto", package: "@ai-sdk/openai-compatible" },
      ],
      models,
    ),
  )
}

function controller() {
  return createRoot((dispose) => ({ ...createModelsController(() => options()), dispose }))
}

describe("model catalog and preferences", () => {
  test("persists independent variant preferences and explicit Default across reloads and visibility edits", () => {
    const initial = structuredClone(DEFAULT_MODEL_CONFIG)
    const list = options([
      model("openai", "one", { variants: [{ id: "high" }] }),
      model("custom", "one", { variants: [{ id: "low" }] }),
    ])
    const primary = { providerID: "openai", modelID: "one" }
    const secondary = { providerID: "custom", modelID: "one" }
    const first = createRoot((dispose) => ({ ...createModelsController(() => list), dispose }))
    first.variant.set(primary, "high")
    first.variant.set(secondary, "low")
    first.setVisibility(primary, false)
    first.recent.push(primary)
    first.compact()
    first.dispose()

    const second = createRoot((dispose) => ({ ...createModelsController(() => list), dispose }))
    expect(second.variant.get(primary)).toBe("high")
    expect(second.variant.get(secondary)).toBe("low")
    second.variant.set(primary, undefined)
    second.dispose()

    const third = createRoot((dispose) => ({ ...createModelsController(() => list), dispose }))
    expect(third.variant.get(primary)).toBe("default")
    expect(third.variant.get(secondary)).toBe("low")
    third.variant.set(primary, "unavailable")
    third.variant.set({ providerID: "missing", modelID: "one" }, "high")
    expect(JSON.parse(saved.get(key)!).variant).toEqual({ "openai/one": "default", "custom/one": "low" })
    expect(DEFAULT_MODEL_CONFIG).toEqual(initial)
    third.dispose()
  })

  test("discards malformed saved variant preferences while preserving valid entries", () => {
    saved.set(key, JSON.stringify({ variant: { "openai/one": "high", invalid: 3, missing: null } }))
    const models = controller()
    models.recent.push({ providerID: "openai", modelID: "one" })
    expect(JSON.parse(saved.get(key)!).variant).toEqual({ "openai/one": "high" })
    models.dispose()
  })

  test("normalizes connected models without mutating the catalog", () => {
    const models = [
      model("openai", "z", { name: "Z (latest)" }),
      model("openai", "old", { status: "deprecated" }),
      model("openai", "a"),
      model("custom", "one"),
      model("disconnected", "one"),
    ]
    const initial = structuredClone(models)
    const list = options(models)

    expect(list.map((item) => [item.providerID, item.id, item.name, item.latest])).toEqual([
      ["custom", "one", "one", false],
      ["openai", "a", "a", false],
      ["openai", "z", "Z", true],
    ])
    expect(models).toEqual(initial)
  })

  test("persists provider toggles and per-model exceptions across reloads", () => {
    saved.set(key, JSON.stringify({ user: [], disabledProviders: [], popularProviders: [], recent: [] }))
    const first = controller()
    first.setProviderVisibility("openai", false)
    first.setProviderVisibility("custom", false)
    first.dispose()

    const second = controller()
    expect(second.visible({ providerID: "openai", modelID: "one" })).toBe(false)
    expect(second.visible({ providerID: "custom", modelID: "one" })).toBe(false)
    second.setVisibility({ providerID: "openai", modelID: "one" }, true)
    second.dispose()

    const third = controller()
    expect(third.visible({ providerID: "openai", modelID: "one" })).toBe(true)
    expect(third.visible({ providerID: "openai", modelID: "two" })).toBe(false)
    third.setProviderVisibility("openai", true)
    third.dispose()

    const fourth = controller()
    expect(fourth.visible({ providerID: "openai", modelID: "two" })).toBe(true)
    expect(JSON.parse(saved.get(key)!).user).toEqual([])
    fourth.dispose()
  })

  test("compacts uniform popular-provider overrides without losing visibility", () => {
    saved.set(
      key,
      JSON.stringify({
        user: [
          { providerID: "openai", modelID: "one", visibility: "hide" },
          { providerID: "openai", modelID: "two", visibility: "hide" },
        ],
        disabledProviders: [],
        popularProviders: [],
        recent: [],
      }),
    )
    const first = controller()
    first.compact()
    first.dispose()
    expect(JSON.parse(saved.get(key)!)).toEqual({
      user: [],
      disabledProviders: [],
      recent: [],
      popularProviders: [{ providerID: "openai", visibility: "hide" }],
    })
    const second = controller()
    expect(second.visible({ providerID: "openai", modelID: "future" })).toBe(false)
    second.dispose()
  })

  test("keeps source defaults isolated from edits and reset controllers", () => {
    const initial = structuredClone(DEFAULT_MODEL_CONFIG)
    const first = controller()
    first.setProviderVisibility("openai", false)
    first.setVisibility({ providerID: "openai", modelID: "one" }, true)
    first.compact()
    first.dispose()
    expect(DEFAULT_MODEL_CONFIG).toEqual(initial)

    saved.clear()
    const second = controller()
    const configured = initial.user.find((item) => item.providerID === "openai" && item.modelID === "one")
    const provider = initial.popularProviders.find((item) => item.providerID === "openai")
    expect(second.visible({ providerID: "openai", modelID: "one" })).toBe(
      (configured?.visibility ??
        provider?.visibility ??
        (initial.disabledProviders.includes("openai") ? "hide" : "show")) === "show",
    )
    second.dispose()
  })

  test("bounds and deduplicates recents even when saved data exceeds the limit", () => {
    saved.set(
      key,
      JSON.stringify({ recent: Array.from({ length: 10 }, (_, i) => ({ providerID: "openai", modelID: `${i}` })) }),
    )
    const models = controller()
    const selected = { providerID: "openai", modelID: "3" }
    models.recent.push(selected)
    selected.modelID = "changed"
    expect(models.recent.list()).toEqual([
      { providerID: "openai", modelID: "3" },
      { providerID: "openai", modelID: "0" },
      { providerID: "openai", modelID: "1" },
      { providerID: "openai", modelID: "2" },
      { providerID: "openai", modelID: "4" },
    ])
    models.dispose()
  })

  test("migrates saved visibility and recents to catalog IDs without mutating source defaults", () => {
    const initial = structuredClone(DEFAULT_MODEL_CONFIG)
    saved.set(
      key,
      JSON.stringify({
        user: [{ providerID: "custom", modelID: "legacy", visibility: "hide" }],
        recent: [{ providerID: "custom", modelID: "legacy" }],
        disabledProviders: [],
      }),
    )
    const list = options([model("custom", "legacy", { id: "configured" })])
    const first = createRoot((dispose) => ({ ...createModelsController(() => list), dispose }))
    first.compact()
    expect(JSON.parse(saved.get(key)!).user).toEqual([
      { providerID: "custom", modelID: "configured", visibility: "hide" },
    ])
    expect(first.recent.list()).toEqual([{ providerID: "custom", modelID: "configured" }])
    first.dispose()

    const second = createRoot((dispose) => ({ ...createModelsController(() => list), dispose }))
    expect(second.visible({ providerID: "custom", modelID: "configured" })).toBe(false)
    expect(second.recent.list()).toEqual([{ providerID: "custom", modelID: "configured" }])
    second.setVisibility({ providerID: "custom", modelID: "configured" }, true)
    expect(JSON.parse(saved.get(key)!).user).toEqual([])
    expect(DEFAULT_MODEL_CONFIG).toEqual(initial)
    second.dispose()
  })

  test("keeps explicit catalog preferences when legacy aliases refer to the same model", () => {
    saved.set(
      key,
      JSON.stringify({
        user: [
          { providerID: "custom", modelID: "configured", visibility: "show" },
          { providerID: "custom", modelID: "legacy", visibility: "hide" },
        ],
        recent: [
          { providerID: "custom", modelID: "legacy" },
          { providerID: "custom", modelID: "configured" },
        ],
        disabledProviders: [],
      }),
    )
    const list = options([model("custom", "legacy", { id: "configured" })])
    const models = createRoot((dispose) => ({ ...createModelsController(() => list), dispose }))
    models.compact()
    expect(models.visible({ providerID: "custom", modelID: "configured" })).toBe(true)
    expect(models.recent.list()).toEqual([{ providerID: "custom", modelID: "configured" }])
    expect(JSON.parse(saved.get(key)!).user).toEqual([
      { providerID: "custom", modelID: "configured", visibility: "show" },
    ])
    models.dispose()
  })
})
