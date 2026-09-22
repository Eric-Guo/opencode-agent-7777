import { describe, expect, test } from "bun:test"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { loadProviderCatalog } from "./providers"

describe("provider catalog loader", () => {
  test("loads providers and models after model initialization", async () => {
    const calls: string[] = []
    const locations: unknown[] = []
    const model = {
      id: "claude-sonnet",
      modelID: "claude-sonnet-4",
      providerID: "anthropic",
      name: "Claude Sonnet",
      capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
      variants: [],
      time: { released: Date.parse("2026-01-02") },
      cost: [],
      status: "active" as const,
      enabled: true,
      limit: { context: 200_000, output: 64_000 },
    }
    const client = {
      model: {
        default: async (input: unknown) => {
          calls.push("default")
          locations.push(input)
          return { data: model }
        },
        list: async (input: unknown) => {
          calls.push("models")
          locations.push(input)
          return { data: [model] }
        },
      },
      provider: {
        list: async (input: unknown) => {
          calls.push("providers")
          locations.push(input)
          return { data: [{ id: "anthropic", name: "Anthropic", package: "@ai-sdk/anthropic" }] }
        },
      },
    } as unknown as OpencodeClient
    const result = await loadProviderCatalog(client, "/repo")

    expect(calls[0]).toBe("default")
    expect(new Set(calls.slice(1))).toEqual(new Set(["providers", "models"]))
    expect(locations).toEqual([
      { location: { directory: "/repo" } },
      { location: { directory: "/repo" } },
      { location: { directory: "/repo" } },
    ])
    expect(result.connected).toEqual(["anthropic"])
    expect(result.default).toEqual({ anthropic: "claude-sonnet" })
    expect(result.all.get("anthropic")?.models["claude-sonnet"]).toMatchObject({
      id: "claude-sonnet",
      api: { id: "claude-sonnet-4" },
      capabilities: { input: { text: true, image: true }, toolcall: true },
    })
  })
})
