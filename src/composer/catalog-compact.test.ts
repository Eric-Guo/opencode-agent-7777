import { expect, test } from "bun:test"
import type { AgentInfo, SkillInfo } from "@opencode/client/promise"
import { createComposerCatalog } from "./catalog-compact"
import type { OpencodeClient } from "@/runtime/server/client-compact"

function pendingCatalog() {
  const commands = Promise.withResolvers<{ data: { name: string; description?: string }[] }>()
  const skills = Promise.withResolvers<{ data: SkillInfo[] }>()
  const agents = Promise.withResolvers<{ data: AgentInfo[] }>()
  const locations: unknown[] = []
  const client = {
    command: {
      list: (input: unknown) => {
        locations.push(input)
        return commands.promise
      },
    },
    skill: {
      list: (input: unknown) => {
        locations.push(input)
        return skills.promise
      },
    },
    agent: {
      list: (input: unknown) => {
        locations.push(input)
        return agents.promise
      },
    },
  } as unknown as Pick<OpencodeClient, "command" | "skill" | "agent">
  return { client, commands, skills, agents, locations }
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
  const catalog = createComposerCatalog()
  const pending = pendingCatalog()
  const load = catalog.load(pending.client, "/workspace")
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
  const catalog = createComposerCatalog()
  const old = pendingCatalog()
  const fresh = pendingCatalog()
  const oldLoad = catalog.load(old.client, "/old")
  const freshLoad = catalog.load(fresh.client, "/fresh")
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
  const nextLoad = catalog.load(next.client, "/next")
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
  const catalog = createComposerCatalog()
  const pending = pendingCatalog()
  const load = catalog.load(pending.client, "/workspace")
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
