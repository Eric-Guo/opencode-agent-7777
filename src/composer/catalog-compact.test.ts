import { afterEach, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import type { AgentInfo, SkillInfo } from "@opencode/client/promise"
import { browserSuite, fixtureData } from "@/runtime/server/runtime.test-fixture"
import { createComposerCatalog } from "./catalog-compact"
import type { OpencodeClient } from "@/runtime/server/client-compact"

browserSuite(import.meta.path, () => {
  const disposers: VoidFunction[] = []
  afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

  function catalogFixture() {
    return createRoot((dispose) => {
      disposers.push(dispose)
      return { ...createComposerCatalog(), dispose }
    })
  }

  function pendingCatalog() {
    const commands = Promise.withResolvers<{ data: { name: string; description?: string }[] }>()
    const skills = Promise.withResolvers<{ data: SkillInfo[] }>()
    const agents = Promise.withResolvers<{ data: AgentInfo[] }>()
    const locations: unknown[] = []
    const client = {
      command: {
        list: (input: unknown) => {
          locations.push(input)
          return commands.promise.then((result) => ({ ...result, ...(input as object) }))
        },
      },
      skill: {
        list: (input: unknown) => {
          locations.push(input)
          return skills.promise.then((result) => ({ ...result, ...(input as object) }))
        },
      },
      agent: {
        list: (input: unknown) => {
          locations.push(input)
          return agents.promise.then((result) => ({ ...result, ...(input as object) }))
        },
      },
    } as unknown as OpencodeClient
    return { data: fixtureData(client), commands, skills, agents, locations }
  }

  function agent(name: string): AgentInfo {
    return {
      id: name,
      name,
      mode: "subagent",
      hidden: false,
      request: { settings: {}, headers: {}, body: {} },
      permissions: [],
    }
  }

  test("loads all catalogs for the active directory and keeps context usable if commands fail", async () => {
    const catalog = catalogFixture()
    const pending = pendingCatalog()
    const load = catalog.load(pending.data, "/workspace")
    expect(pending.locations).toEqual([
      { location: { directory: "/workspace" } },
      { location: { directory: "/workspace" } },
      { location: { directory: "/workspace" } },
    ])
    pending.commands.reject(new Error("Unavailable"))
    pending.skills.resolve({
      data: [{ id: "plugin/review", name: "Review", path: "/skills/review", content: "Review code" }],
    })
    pending.agents.resolve({ data: [agent("explore")] })
    await load
    expect(catalog.state).toEqual({
      commands: [],
      skills: [{ id: "plugin/review", name: "Review", path: "/skills/review", content: "Review code" }],
      agents: [agent("explore")],
      commandStatus: "failed",
      skillStatus: "ready",
      agentStatus: "ready",
    })
  })

  test("discards responses from an older directory and clears catalogs during a new load", async () => {
    const catalog = catalogFixture()
    const old = pendingCatalog()
    const fresh = pendingCatalog()
    const oldLoad = catalog.load(old.data, "/old")
    const freshLoad = catalog.load(fresh.data, "/fresh")
    fresh.commands.resolve({ data: [{ name: "review", description: "Review changes" }] })
    fresh.skills.resolve({ data: [{ id: "review", name: "Review", path: "/skills/review", content: "Review code" }] })
    fresh.agents.resolve({ data: [agent("fresh")] })
    await freshLoad
    old.commands.resolve({ data: [{ name: "stale" }] })
    old.skills.reject(new Error("Old failure"))
    old.agents.resolve({ data: [agent("stale")] })
    await oldLoad
    expect(catalog.state).toEqual({
      commands: [{ name: "review", description: "Review changes" }],
      skills: [{ id: "review", name: "Review", path: "/skills/review", content: "Review code" }],
      agents: [agent("fresh")],
      commandStatus: "ready",
      skillStatus: "ready",
      agentStatus: "ready",
    })
    const next = pendingCatalog()
    const nextLoad = catalog.load(next.data, "/next")
    expect(catalog.state).toEqual({
      commands: [],
      skills: [],
      agents: [],
      commandStatus: "loading",
      skillStatus: "loading",
      agentStatus: "loading",
    })
    catalog.clear()
    next.commands.resolve({ data: [{ name: "ignored" }] })
    next.skills.resolve({ data: [] })
    next.agents.reject(new Error("Ignored failure"))
    await nextLoad
    expect(catalog.state).toEqual({
      commands: [],
      skills: [],
      agents: [],
      commandStatus: "loading",
      skillStatus: "loading",
      agentStatus: "loading",
    })
  })

  test("agent catalog failure leaves commands and skills available", async () => {
    const catalog = catalogFixture()
    const pending = pendingCatalog()
    const load = catalog.load(pending.data, "/workspace")
    pending.commands.resolve({ data: [{ name: "review" }] })
    pending.skills.resolve({ data: [{ id: "review", name: "Review", path: "/skills/review", content: "Review code" }] })
    pending.agents.reject(new Error("Unavailable"))
    await load
    expect(catalog.state).toEqual({
      commands: [{ name: "review" }],
      skills: [{ id: "review", name: "Review", path: "/skills/review", content: "Review code" }],
      agents: [],
      commandStatus: "ready",
      skillStatus: "ready",
      agentStatus: "failed",
    })
  })

  test("shares catalog requests between consumers while retaining independent editor state", async () => {
    const first = catalogFixture()
    const second = catalogFixture()
    const pending = pendingCatalog()
    const one = first.load(pending.data, "/repo")
    const two = second.load(pending.data, "/repo")
    expect(pending.locations).toHaveLength(3)
    pending.commands.resolve({ data: [{ name: "review" }] })
    pending.skills.reject(new Error("Skill unavailable"))
    pending.agents.resolve({ data: [agent("explore")] })
    await Promise.all([one, two])
    first.clear()
    expect(first.state.commands).toEqual([])
    expect(second.state.commands).toEqual([{ name: "review" }])
    expect(second.state.skillStatus).toBe("failed")
    expect(second.state.agentStatus).toBe("ready")
  })

  test("settles each catalog independently and retries a failure without copying the shared cache", async () => {
    const catalog = catalogFixture()
    const pending = pendingCatalog()
    const load = catalog.load(pending.data, "/repo")
    pending.commands.reject(new Error("Unavailable"))
    pending.skills.resolve({ data: [] })
    await pending.data.location.command.sync({ directory: "/repo" }).catch(() => {})
    await pending.data.location.skill.sync({ directory: "/repo" })
    expect(catalog.state.commandStatus).toBe("failed")
    expect(catalog.state.skillStatus).toBe("ready")
    expect(catalog.state.agentStatus).toBe("loading")
    pending.agents.resolve({ data: [agent("explore")] })
    await load

    // A later load uses the shared client's existing retry path and leaves successful reads cached.
    const retry = Promise.withResolvers<{ data: { name: string }[] }>()
    pending.commands.promise = retry.promise
    const reloading = catalog.load(pending.data, "/repo")
    expect(catalog.state.commandStatus).toBe("loading")
    expect(catalog.state.agents).toEqual([agent("explore")])
    retry.resolve({ data: [{ name: "review" }] })
    await reloading
    expect(catalog.state.commandStatus).toBe("ready")
    expect(catalog.state.commands).toEqual([{ name: "review" }])
    expect(pending.locations).toHaveLength(4)

    // Event-driven refreshes still publish through the live shared store after this adapter settles.
    pending.commands.promise = Promise.resolve({ data: [{ name: "updated" }] })
    pending.data.location.command.invalidate({ directory: "/repo" })
    await pending.data.location.command.sync({ directory: "/repo" })
    expect(catalog.state.commands).toEqual([{ name: "updated" }])
  })

  test.each(["clear", "dispose"] as const)(
    "%s releases observations without cancelling another consumer's read",
    async (action) => {
      const first = catalogFixture()
      const second = catalogFixture()
      const pending = pendingCatalog()
      const one = first.load(pending.data, "/repo")
      const two = second.load(pending.data, "/repo")
      first[action]()
      pending.commands.resolve({ data: [{ name: "review" }] })
      pending.skills.reject(new Error("Unavailable"))
      pending.agents.resolve({ data: [agent("explore")] })
      await Promise.all([one, two])
      expect(first.state).toEqual({
        commands: [],
        skills: [],
        agents: [],
        commandStatus: "loading",
        skillStatus: "loading",
        agentStatus: "loading",
      })
      expect(second.state).toEqual({
        commands: [{ name: "review" }],
        skills: [],
        agents: [agent("explore")],
        commandStatus: "ready",
        skillStatus: "failed",
        agentStatus: "ready",
      })
      expect(pending.locations).toHaveLength(3)
    },
  )
})
