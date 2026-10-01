import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { readableError } from "@/shell/errors/readable"
import type { SessionInfo as Session } from "@opencode/client/promise"
import { loadHomeSessionPage } from "./index"

// Recent-session loading only; 7777 does not expose the main app's directory sync context.

export function sessionUpdatedTime(session: Session) {
  return session.time.updated ?? session.time.created
}

export function refreshRecentSessions() {
  const runtime = currentRuntime()
  const server = state.server
  const directory = state.session ? sessionDirectory(state.session) : undefined
  if (!server || !directory) {
    setState("recentSessions", [])
    return Promise.resolve()
  }

  const client = createDirectorySdk(server, directory).client
  setState("recentSessionsLoading", true)
  return loadHomeSessionPage({
    directory,
    sessionID: state.session!.id,
    list: client.session.list,
    get: client.session.get,
  })
    .then((result) => {
      if (currentRuntime() !== runtime || !state.session || sessionDirectory(state.session) !== directory) return
      setState("recentSessions", result.items)
    })
    .catch((error) => {
      if (currentRuntime() === runtime) setState("error", readableError(error))
    })
    .finally(() => {
      if (currentRuntime() === runtime) setState("recentSessionsLoading", false)
    })
}
