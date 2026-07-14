import { createMemo, createSignal } from "solid-js"
import { createSession } from "@/context/global-sync/session-load"
import { translateSync } from "@/context/language"
import { setState, state } from "@/context/server-session"
import { activateSession, restartSessionEventStream } from "@/context/server-sync"
import { createServerSdk } from "@/context/server-sdk"
import { sessionDirectory } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"

let newSessionPromise: Promise<void> | undefined

export function startNewSession() {
  if (newSessionPromise) return newSessionPromise

  const server = state.server
  const directory = state.session ? sessionDirectory(state.session) : undefined
  if (!server || !directory) {
    setState("error", translateSync("error.sessionNotReady"))
    return Promise.resolve()
  }

  setState("error", "")
  const baseClient = createServerSdk(server).client
  newSessionPromise = createSession(baseClient, directory)
    .then((session) =>
      activateSession(server, session).then(() => {
        setState("welcomeSessionID", session.id)
      }),
    )
    .then(() => {
      restartSessionEventStream()
    })
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
