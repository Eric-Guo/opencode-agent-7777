import { createMemo, createSignal } from "solid-js"
import { translateSync } from "@/context/language"
import { createSession, setState, state } from "@/context/server-session"
import { activateSession, restartSessionEventStream } from "@/context/server-sync"
import { makeClient } from "@/context/sdk"
import { readableError } from "@/utils/server-errors"

let newSessionPromise: Promise<void> | undefined

export function startNewSession() {
  if (newSessionPromise) return newSessionPromise

  const server = state.server
  const directory = state.session?.directory
  if (!server || !directory) {
    setState("error", translateSync("error.sessionNotReady"))
    return Promise.resolve()
  }

  setState("error", "")
  const baseClient = makeClient(server)
  newSessionPromise = createSession(baseClient, directory)
    .then((session) => activateSession(server, session))
    .then(restartSessionEventStream)
    .catch((error) => {
      setState("error", readableError(error))
    })
    .finally(() => {
      newSessionPromise = undefined
    })

  return newSessionPromise
}

export function createNewSessionController() {
  const [pending, setPending] = createSignal(false)
  const disabled = createMemo(() => state.status !== "ready")

  const create = () => {
    if (pending() || disabled()) return
    setPending(true)
    void startNewSession().finally(() => setPending(false))
  }

  return {
    pending,
    disabled,
    create,
  }
}
