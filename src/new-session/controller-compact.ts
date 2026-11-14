import { createMemo, createSignal, onCleanup } from "solid-js"
import { createLoadState, transitionLoad } from "@/runtime/server/load-machine"
import { readableError } from "@/shell/errors/readable"
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
  const [machine, setMachine] = createSignal(createLoadState())
  onCleanup(() => setMachine((value) => transitionLoad(value, { type: "disposed" })))
  const disabled = createMemo(() => state.status !== "ready")

  const create = () => {
    if (machine().status === "loading" || machine().status === "disposed" || disabled()) return
    setMachine((value) => transitionLoad(value, { type: "started" }))
    const attempt = machine().attempt
    void startNewSession().then(
      () => setMachine((value) => transitionLoad(value, { type: "succeeded", attempt })),
      (error) => {
        if (machine().status !== "loading" || machine().attempt !== attempt) return
        setMachine((value) => transitionLoad(value, { type: "failed", attempt, error }))
        setState("error", readableError(error))
      },
    )
  }

  return {
    pending: () => machine().status === "loading",
    disabled,
    create,
  }
}
