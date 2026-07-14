import { describe, expect, test } from "bun:test"
import { selectProviderCatalog, type ProviderCatalogData } from "./provider-catalog"

const provider = (id: string) => ({ id, name: id, package: `package:${id}` })

describe("provider catalog", () => {
  test("selects connected providers without discarding the full catalog", () => {
    const first = provider("first")
    const second = provider("second")
    const model = {
      id: "model",
      modelID: "model",
      providerID: second.id,
      name: "model",
      capabilities: { tools: true, input: ["text"], output: ["text"] },
      variants: [],
      time: { released: 0 },
      cost: [],
      status: "active" as const,
      enabled: true,
      limit: { context: 1, output: 1 },
    }
    const catalog = selectProviderCatalog({
      providers: [first, second],
      models: [model],
      defaultModel: model,
    } satisfies ProviderCatalogData)

    expect(catalog.all).toEqual([
      { ...first, models: {} },
      { ...second, models: { model } },
    ])
    expect(catalog.connected).toEqual([{ ...second, models: { model } }])
    expect(catalog.default).toEqual({ second: "model" })
  })
})
