import { describe, expect, test } from "bun:test"
import type { ModelInfo, ProviderInfo } from "@opencode/client/promise"
import { createStore } from "solid-js/store"
import { normalizeProviderList } from "./utils"

const provider = (id: string, activation: ProviderInfo["activation"] = "auto"): ProviderInfo => ({
  id,
  name: id,
  package: `package:${id}`,
  activation,
})

function model(input: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id: "configured-model",
    modelID: "api-model",
    providerID: "provider",
    name: "Model",
    capabilities: { tools: true, input: ["text", "image", "pdf"], output: ["text"] },
    variants: [{ id: "high", settings: { effort: "high" } }],
    time: { released: Date.parse("2026-01-02") },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 1000, output: 100 },
    ...input,
  }
}

describe("normalizeProviderList", () => {
  test("keeps catalog IDs separate from API IDs and normalizes display metadata", () => {
    const providers = [provider("provider")]
    const models = [
      model({
        cost: [
          { input: 9, output: 12, cache: { read: 3, write: 4 }, tier: { type: "context", size: 100 } },
          { input: 1, output: 2, cache: { read: 0.1, write: 0.2 } },
        ],
      }),
    ]
    const original = structuredClone({ providers, models })
    const result = normalizeProviderList(providers, models)

    expect(result.connected).toEqual(["provider"])
    expect(result.default).toEqual({ provider: "configured-model" })
    expect(result.all.get("provider")?.models["configured-model"]).toMatchObject({
      id: "configured-model",
      api: { id: "api-model" },
      capabilities: {
        toolcall: true,
        attachment: true,
        input: { text: true, image: true, audio: false, video: false, pdf: true },
        output: { text: true, image: false, audio: false, video: false, pdf: false },
      },
      cost: { input: 1, output: 2, cache: { read: 0.1, write: 0.2 } },
      release_date: "2026-01-02",
      variants: { high: { effort: "high" } },
    })
    expect(result.all.get("provider")?.models["configured-model"].capabilities.reasoning).toBeUndefined()
    expect({ providers, models }).toEqual(original)
  })

  test("keeps disabled and empty providers in the full catalog but out of selection", () => {
    const result = normalizeProviderList(
      [provider("empty"), provider("provider"), provider("disabled", "disabled"), provider("deprecated")],
      [
        model(),
        model({ providerID: "disabled" }),
        model({ providerID: "deprecated", status: "deprecated" }),
        model({ providerID: "missing" }),
      ],
    )

    expect([...result.all.keys()]).toEqual(["empty", "provider", "disabled", "deprecated"])
    expect(result.connected).toEqual(["provider"])
    expect(result.all.get("empty")?.models).toEqual({})
    expect(result.all.get("deprecated")?.models).toEqual({})
    expect(result.all.get("disabled")?.models["configured-model"].id).toBe("configured-model")
  })

  test("keeps two configured models that use the same provider API model", () => {
    const result = normalizeProviderList([provider("provider")], [model(), model({ id: "second" })])
    expect(Object.keys(result.all.get("provider")!.models)).toEqual(["configured-model", "second"])
  })

  test("reuses unchanged catalog lists and invalidates when either list is replaced", () => {
    const providers = [provider("provider")]
    const models = [model()]
    const [state, setState] = createStore({ providers, models })
    const first = normalizeProviderList(providers, models)
    expect(normalizeProviderList(state.providers, state.models)).toBe(first)
    expect(normalizeProviderList(first)).toBe(first)

    setState("models", [model({ name: "Updated" })])
    const updated = normalizeProviderList(state.providers, state.models)
    expect(updated).not.toBe(first)
    expect(updated.all.get("provider")?.models["configured-model"].name).toBe("Updated")
    expect(first.all.get("provider")?.models["configured-model"].name).toBe("Model")

    setState("providers", [provider("provider", "disabled")])
    expect(normalizeProviderList(state.providers, state.models).connected).toEqual([])
  })
})
