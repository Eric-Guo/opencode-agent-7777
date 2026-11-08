import type { Data } from "@opencode/client/solid"
import type { AgentInfo, CommandInfo, SkillInfo } from "@opencode/client/promise"
import { createMemo, createResource, createSignal, onCleanup, untrack } from "solid-js"

type CatalogStatus = "loading" | "ready" | "failed"
type CatalogState = {
  commands: CommandInfo[]
  skills: SkillInfo[]
  agents: AgentInfo[]
  commandStatus: CatalogStatus
  skillStatus: CatalogStatus
  agentStatus: CatalogStatus
}
type ComposerCatalog = {
  state: CatalogState
  load: (data: Data, directory: string) => Promise<void>
  clear: () => void
}

// Shared location resources own catalog contents. Only editor loading/error state is local.
export function createComposerCatalog(): ComposerCatalog {
  const [source, setSource] = createSignal<{ data: Data; directory: string }>()
  const reads = createMemo(() => {
    const active = source()
    if (!active) return
    const read = (key: "command" | "skill" | "agent") => {
      const complete = active.data.location[key].sync({ directory: active.directory })
      const [resource] = createResource(() => complete)
      return {
        complete,
        // Read state only: catalog loading must never suspend the composer or throw into its boundary.
        status: (): CatalogStatus =>
          resource.state === "errored" ? "failed" : resource.state === "ready" ? "ready" : "loading",
      }
    }
    return { command: read("command"), skill: read("skill"), agent: read("agent") }
  })
  const clear = () => {
    setSource(undefined)
  }
  onCleanup(clear)
  const list = <K extends "command" | "skill" | "agent">(key: K) => {
    const active = source()
    return active?.data.location[key].list({ directory: active.directory })
  }
  const state: CatalogState = {
    get commands() {
      return (list("command") ?? []) as CommandInfo[]
    },
    get skills() {
      return (list("skill") ?? []) as SkillInfo[]
    },
    get agents() {
      return (list("agent") ?? []) as AgentInfo[]
    },
    get commandStatus() {
      return reads()?.command.status() ?? "loading"
    },
    get skillStatus() {
      return reads()?.skill.status() ?? "loading"
    },
    get agentStatus() {
      return reads()?.agent.status() ?? "loading"
    },
  }
  const load = async (data: Data, directory: string) => {
    // A new owner disposes the previous resource observations, even for a repeat load of the same directory.
    // The shared client's reads continue for other consumers; this adapter never cancels or copies their cache.
    setSource({ data, directory })
    const current = untrack(reads)
    if (current) await Promise.allSettled(Object.values(current).map((read) => read.complete))
  }
  return { state, load, clear }
}
