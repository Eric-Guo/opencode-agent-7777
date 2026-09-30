import { expect, test } from "bun:test"
import type { SkillInfo } from "@opencode/client/promise"
import { createComposerCatalog } from "./catalog-compact"
import type { OpencodeClient } from "@/runtime/server/client-compact"

function pendingCatalog() {
  const commands = Promise.withResolvers<{ data: { name: string; description?: string }[] }>()
  const skills = Promise.withResolvers<{ data: SkillInfo[] }>()
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
  } as unknown as Pick<OpencodeClient, "command" | "skill">
  return { client, commands, skills, locations }
}

test("loads both catalogs for the active directory and keeps skills usable if commands fail", async () => {
  const catalog = createComposerCatalog()
  const pending = pendingCatalog()
  const load = catalog.load(pending.client, "/workspace")
  expect(pending.locations).toEqual([
    { location: { directory: "/workspace" } },
    { location: { directory: "/workspace" } },
  ])
  pending.commands.reject(new Error("Unavailable"))
  pending.skills.resolve({
    data: [{ id: "plugin/review", name: "Review", path: "/skills/review", content: "Review code" }],
  })
  await load
  expect(catalog.state).toEqual({
    commands: [],
    skills: [{ id: "plugin/review", name: "Review", path: "/skills/review", content: "Review code" }],
    commandStatus: "failed",
    skillStatus: "ready",
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
  await freshLoad
  old.commands.resolve({ data: [{ name: "stale" }] })
  old.skills.reject(new Error("Old failure"))
  await oldLoad
  expect(catalog.state).toEqual({
    commands: [{ name: "review", description: "Review changes" }],
    skills: [{ id: "review", name: "Review", path: "/skills/review", content: "Review code" }],
    commandStatus: "ready",
    skillStatus: "ready",
  })
  const next = pendingCatalog()
  const nextLoad = catalog.load(next.client, "/next")
  expect(catalog.state).toEqual({ commands: [], skills: [], commandStatus: "loading", skillStatus: "loading" })
  catalog.clear()
  next.commands.resolve({ data: [{ name: "ignored" }] })
  next.skills.resolve({ data: [] })
  await nextLoad
  expect(catalog.state).toEqual({ commands: [], skills: [], commandStatus: "loading", skillStatus: "loading" })
})
