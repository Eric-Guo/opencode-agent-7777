import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { DEFAULT_MODEL_CONFIG } from "./default-config"
import { createModelsController, modelOptions } from "./models"
import { selectProviderCatalog, type ProviderModel } from "@/providers/catalog/client-compact"

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
  else Reflect.deleteProperty(globalThis, "localStorage")
})

function model(providerID: string, modelID: string, input: Partial<ProviderModel> = {}): ProviderModel {
  return {
    id: `${providerID}/${modelID}`,
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
    selectProviderCatalog({
      providers: [
        { id: "openai", name: "OpenAI", activation: "auto", package: "@ai-sdk/openai" },
        { id: "custom", name: "Custom", activation: "auto", package: "@ai-sdk/openai-compatible" },
      ],
      models,
      defaultModel: null,
    }),
  )
}

function controller() {
  return createRoot((dispose) => ({ ...createModelsController(() => options()), dispose }))
}

describe("model catalog and preferences", () => {
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
})
