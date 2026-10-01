import type { Data } from "@opencode/client/solid"
import type { AgentInfo, CommandInfo, SkillInfo } from "@opencode/client/promise"
import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"

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
  const [status, setStatus] = createStore({
    commandStatus: "loading" as CatalogStatus,
    skillStatus: "loading" as CatalogStatus,
    agentStatus: "loading" as CatalogStatus,
  })
  let version = 0
  const clear = () => {
    version++
    setSource(undefined)
    setStatus({ commandStatus: "loading", skillStatus: "loading", agentStatus: "loading" })
  }
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
      return status.commandStatus
    },
    get skillStatus() {
      return status.skillStatus
    },
    get agentStatus() {
      return status.agentStatus
    },
  }
  const load = async (data: Data, directory: string) => {
    clear()
    const current = version
    setSource({ data, directory })
    await Promise.all(
      (["command", "skill", "agent"] as const).map((key) =>
        data.location[key].sync({ directory }).then(
          () => {
            if (current === version) setStatus(`${key}Status`, "ready")
          },
          () => {
            if (current === version) setStatus(`${key}Status`, "failed")
          },
        ),
      ),
    )
  }
  return { state, load, clear }
}
