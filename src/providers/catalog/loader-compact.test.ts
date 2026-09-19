import { afterEach, describe, expect, test } from "bun:test"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import type { SessionInfo as Session } from "@opencode/client/promise"
import { loadProviderCatalog, refreshModels } from "./loader-compact"
import { setState, state } from "@/runtime/server/session-store-compact"

function catalogClient(providerID: string, ready = Promise.resolve(), agentsReady = Promise.resolve()) {
  const model = {
    id: "reasoning",
    modelID: "reasoning-api",
    providerID,
    name: "Reasoning",
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    variants: [{ id: "high" }],
    time: { released: 1 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 200_000, output: 64_000 },
  }
  const locations: unknown[] = []
  const client = {
    model: {
      default: async () => {
        await ready
        return { data: model }
      },
      list: async () => ({ data: [model] }),
    },
    provider: { list: async () => ({ data: [{ id: providerID, name: providerID, package: "@ai-sdk/provider" }] }) },
    agent: {
      list: async (input: unknown) => {
        locations.push(input)
        await agentsReady
        return {
          data: [{ id: "7777", model: { providerID, id: "reasoning", variant: "high" } }, { id: "unconfigured" }],
        }
      },
    },
  } as unknown as OpencodeClient
  return { client, locations }
}

afterEach(() =>
  setState({
    session: undefined,
    models: [],
    selectedModel: undefined,
    agentModels: {},
    modelStatus: "loading",
    error: "",
  }),
)

describe("active catalog refresh", () => {
  const session = (id: string) => ({ id, location: { directory: "/repo" } }) as Session

  test("loads agent defaults in the active directory using catalog model IDs", async () => {
    const { client, locations } = catalogClient("provider")
    const active = session("defaults")
    setState("session", active)
    await refreshModels(client, active)
    expect(state.modelStatus).toBe("ready")
    expect(state.agentModels).toEqual({ "7777": { providerID: "provider", modelID: "reasoning", variant: "high" } })
    expect(locations).toEqual([{ location: { directory: "/repo" } }])
  })

  test("keeps models available if loading optional agent defaults fails", async () => {
    const agents = Promise.withResolvers<void>()
    const { client } = catalogClient("available", Promise.resolve(), agents.promise)
    const active = session("agent-failure")
    setState({ session: active, agentModels: { stale: { providerID: "old", modelID: "old" } } })
    const loading = refreshModels(client, active)
    agents.reject(new Error("agent catalog unavailable"))
    await loading
    expect(state.modelStatus).toBe("ready")
    expect(state.models[0].providerID).toBe("available")
    expect(state.agentModels).toEqual({})
    expect(state.error).toBe("")
  })

  test.each([false, true])("ignores a stale catalog after a session switch, failed=%s", async (failed) => {
    const ready = Promise.withResolvers<void>()
    const old = session("old")
    setState("session", old)
    const previous = refreshModels(catalogClient("old", ready.promise).client, old)
    const next = session("next")
    setState("session", next)
    await refreshModels(catalogClient("next").client, next)
    if (failed) ready.reject(new Error("stale failure"))
    else ready.resolve()
    await previous
    expect(state.models.map((model) => model.providerID)).toEqual(["next"])
    expect(state.agentModels["7777"]).toEqual({ providerID: "next", modelID: "reasoning", variant: "high" })
    expect(state.modelStatus).toBe("ready")
    expect(state.error).toBe("")
  })

  test("the latest refresh wins even within the same session", async () => {
    const ready = Promise.withResolvers<void>()
    const active = session("same-session")
    setState("session", active)
    const previous = refreshModels(catalogClient("old", ready.promise).client, active)
    await refreshModels(catalogClient("new").client, active)
    ready.resolve()
    await previous
    expect(state.models.map((model) => model.providerID)).toEqual(["new"])
  })
})

describe("provider catalog loader", () => {
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
    expect(result.connected).toEqual(["anthropic"])
    expect(result.default).toEqual({ anthropic: "claude-sonnet" })
    expect(result.all.get("anthropic")?.models["claude-sonnet"]).toMatchObject({
      id: "claude-sonnet",
      api: { id: "claude-sonnet-4" },
      capabilities: { input: { text: true, image: true }, toolcall: true },
    })
  })
})
