import { describe, expect, test } from "bun:test"
import { selectProviderCatalog, type ProviderCatalogData } from "./client-compact"

const provider = (id: string, activation: "auto" | "enabled" | "disabled" = "auto") => ({
  id,
  name: id,
  package: `package:${id}`,
  activation,
})

describe("provider catalog", () => {
  test("selects connected providers without discarding the full catalog", () => {
    const first = provider("first")
    const second = provider("second")
    const disabled = provider("disabled", "disabled")
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
    const disabledModel = { ...model, id: "disabled-model", modelID: "disabled-model", providerID: disabled.id }
    const catalog = selectProviderCatalog({
      providers: [first, second, disabled],
      models: [model, disabledModel],
      defaultModel: model,
    } satisfies ProviderCatalogData)

    expect(catalog.all).toEqual([
      { ...first, models: {} },
      { ...second, models: { model } },
      { ...disabled, models: { "disabled-model": disabledModel } },
    ])
    expect(catalog.connected).toEqual([{ ...second, models: { model } }])
    expect(catalog.default).toEqual({ second: "model" })
  })
})
