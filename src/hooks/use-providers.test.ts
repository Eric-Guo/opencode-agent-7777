import { describe, expect, test } from "bun:test"
import type { OpencodeClient } from "@/context/sdk"
import type { Session } from "@/context/session-directory"
import { loadProviderCatalog } from "./use-providers"

describe("loadProviderCatalog", () => {
  test("loads providers and models after model initialization", async () => {
    const calls: string[] = []
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
        default: async () => {
          calls.push("default")
          return { data: model }
        },
        list: async () => {
          calls.push("models")
          return { data: [model] }
        },
      },
      provider: {
        list: async () => {
          calls.push("providers")
          return { data: [{ id: "anthropic", name: "Anthropic", package: "@ai-sdk/anthropic" }] }
        },
      },
    } as unknown as OpencodeClient
    const session = { location: { directory: "/repo" } } as Session

    const result = await loadProviderCatalog(client, session)

    expect(calls[0]).toBe("default")
    expect(new Set(calls.slice(1))).toEqual(new Set(["providers", "models"]))
    expect(result.connected.map((provider) => provider.id)).toEqual(["anthropic"])
    expect(result.default).toEqual({ anthropic: "claude-sonnet-4" })
    expect(result.all[0]?.models["claude-sonnet-4"]).toEqual(model)
  })
})
