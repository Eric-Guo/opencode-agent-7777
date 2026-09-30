import type { CommandInfo, SkillInfo } from "@opencode/client/promise"
import { createStore, type Store } from "solid-js/store"
import type { OpencodeClient } from "@/runtime/server/client-compact"

type CatalogStatus = "loading" | "ready" | "failed"
type CatalogState = {
  commands: CommandInfo[]
  skills: SkillInfo[]
  commandStatus: CatalogStatus
  skillStatus: CatalogStatus
}
type ComposerCatalog = {
  state: Store<CatalogState>
  load: (client: Pick<OpencodeClient, "command" | "skill">, directory: string) => Promise<void>
  clear: () => void
}

// The embedded editor only needs the active directory's server commands and skills.
export function createComposerCatalog(): ComposerCatalog {
  const [state, setState] = createStore<CatalogState>({
    commands: [],
    skills: [],
    commandStatus: "loading",
    skillStatus: "loading",
  })
  let version = 0

  const clear = () => {
    version++
    setState({ commands: [], skills: [], commandStatus: "loading", skillStatus: "loading" })
  }
  const load = async (client: Pick<OpencodeClient, "command" | "skill">, directory: string) => {
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
    ])
  }

  return { state, load, clear }
}
