import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { currentDirectory, currentDraft, currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { loadHomeSessionPage } from "./index"

// Recent-session loading only; 7777 does not expose the main app's directory sync context.

export function refreshRecentSessions() {
  const runtime = currentRuntime() ?? currentDraft()
  const server = state.server
  const directory = currentDirectory()
  if (!server || !directory) {
    setState("recentSessions", [])
    return Promise.resolve()
  }

  const client = createDirectorySdk(server, directory).client
  setState("recentSessionsLoading", true)
  return loadHomeSessionPage({
    directory,
    sessionID: state.session?.id ?? "",
    list: client.session.list,
    get: client.session.get,
  })
    .then((result) => {
      if ((currentRuntime() ?? currentDraft()) !== runtime || currentDirectory() !== directory) return
      setState("recentSessions", result.items)
    })
    .catch((error) => {
      if ((currentRuntime() ?? currentDraft()) === runtime) setState("error", readableError(error))
    })
    .finally(() => {
      if ((currentRuntime() ?? currentDraft()) === runtime) setState("recentSessionsLoading", false)
    })
}
