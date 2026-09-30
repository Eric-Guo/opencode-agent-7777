import type { AgentInfo, CommandInfo, SkillInfo } from "@opencode/client/promise"
import { createStore, type Store } from "solid-js/store"
import type { OpencodeClient } from "@/runtime/server/client-compact"

type CatalogStatus = "loading" | "ready" | "failed"
type CatalogState = {
  commands: CommandInfo[]
  skills: SkillInfo[]
  agents: AgentInfo[]
  commandStatus: CatalogStatus
  skillStatus: CatalogStatus
  agentStatus: CatalogStatus
}
type CatalogClient = Pick<OpencodeClient, "command" | "skill" | "agent">
type ComposerCatalog = {
  state: Store<CatalogState>
  load: (client: CatalogClient, directory: string) => Promise<void>
  clear: () => void
}

// The embedded editor only needs the active directory's server suggestion catalogs.
export function createComposerCatalog(): ComposerCatalog {
  const [state, setState] = createStore<CatalogState>({
    commands: [],
    skills: [],
    agents: [],
    commandStatus: "loading",
    skillStatus: "loading",
    agentStatus: "loading",
  })
  let version = 0

  const clear = () => {
    version++
    setState({
      commands: [],
      skills: [],
      agents: [],
      commandStatus: "loading",
      skillStatus: "loading",
      agentStatus: "loading",
    })
  }
  const load = async (client: CatalogClient, directory: string) => {
    clear()
    const current = version
    const location = { directory }
    await Promise.all([
      client.command.list({ location }).then(
        (result) => {
          if (current === version) setState({ commands: result.data, commandStatus: "ready" })
        },
        () => {
          if (current === version) setState("commandStatus", "failed")
        },
      ),
      client.skill.list({ location }).then(
        (result) => {
          if (current === version) setState({ skills: result.data, skillStatus: "ready" })
        },
        () => {
          if (current === version) setState("skillStatus", "failed")
        },
      ),
      client.agent.list({ location }).then(
        (result) => {
          if (current === version) setState({ agents: result.data, agentStatus: "ready" })
        },
        () => {
          if (current === version) setState("agentStatus", "failed")
        },
      ),
    ])
  }

  return { state, load, clear }
}
