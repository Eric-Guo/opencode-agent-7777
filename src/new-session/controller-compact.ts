import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { activateDraft } from "@/runtime/server/global-sync/bootstrap-session"
import { translateSync } from "@/runtime/i18n/language"
import { currentDirectory, setState, state } from "@/runtime/server/session-store-compact"

// Controller for the header action; 7777 has no standalone new-session page.
export function startNewSession() {
  const server = state.server
  const directory = currentDirectory()
  if (!server || !directory) {
    setState("error", translateSync("error.sessionNotReady"))
    return Promise.resolve()
  }
  return activateDraft(server, directory)
}

export function createNewSessionController() {
  const [local, setLocal] = createStore({ pending: false })
  const disabled = createMemo(() => state.status !== "ready")

  const create = () => {
    if (local.pending || disabled()) return
    setLocal("pending", true)
    void startNewSession().finally(() => setLocal("pending", false))
  }

  return {
    pending: () => local.pending,
    disabled,
    create,
  }
}
