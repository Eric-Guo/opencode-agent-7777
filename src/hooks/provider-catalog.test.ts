import { describe, expect, test } from "bun:test"
import { selectProviderCatalog, type ProviderCatalogData } from "./provider-catalog"

const provider = (id: string) => ({ id, name: id, env: [], models: {} })

describe("provider catalog", () => {
  test("selects connected providers without discarding the full catalog", () => {
    const first = provider("first")
    const second = provider("second")
    const catalog = selectProviderCatalog({
      all: [first, second],
      connected: [second.id],
      default: { [second.id]: "model" },
    } satisfies ProviderCatalogData)

    expect(catalog.all).toEqual([first, second])
    expect(catalog.connected).toEqual([second])
    expect(catalog.default).toEqual({ second: "model" })
  })
})
