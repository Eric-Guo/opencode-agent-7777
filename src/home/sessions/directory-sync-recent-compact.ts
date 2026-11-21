import { abort } from "@opencode/util/abort"
import { clearReadError, reportReadError } from "@/runtime/server/read-errors"
import {
  currentDirectory,
  currentDraft,
  currentRuntime,
  isCurrentDirectory,
  setState,
  state,
} from "@/runtime/server/session-store-compact"
import { loadHomeSessionPage } from "./index"

// The compact store has one directory list for child-session request routing.
let latest: AbortController | undefined

export async function refreshRecentSessions(): Promise<void> {
  const owner = currentRuntime() ?? currentDraft()
  const directory = currentDirectory()
  if (!state.server || !directory || !owner || owner.signal.aborted) {
    abort(latest)
    setState("recentSessions", [])
    return
  }

  const previous = latest
  const request = new AbortController()
  latest = request
  const signal = AbortSignal.any([owner.signal, request.signal])
  const current = () => latest === request && !signal.aborted && isCurrentDirectory(directory)
  // Retire the retry action with the request, even if navigation happens after it failed.
  signal.addEventListener(
    "abort",
    () => {
      clearReadError(request)
      if (latest !== request) return
      latest = undefined
      setState("recentSessionsLoading", false)
    },
    { once: true },
  )
  abort(previous)
  if (!current()) return
  const { list, get } = owner.api.session
  const source = { directory, sessionID: state.session?.id ?? "", list, get }
  setState("recentSessionsLoading", true)
  try {
    const page = await loadHomeSessionPage(source, { signal })
    if (current()) setState("recentSessions", page.items)
  } catch (error) {
    if (current()) {
      reportReadError(request, error, () => {
        if (current()) void refreshRecentSessions()
      })
    }
  } finally {
    if (latest === request) setState("recentSessionsLoading", false)
  }
}
