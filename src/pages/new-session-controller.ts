import { createMemo, createSignal } from "solid-js"
import { createSession } from "@/context/global-sync/session-load-current"
import { translateSync } from "@/context/language"
import { setState, state } from "@/context/server-session-store"
import { activateSession, restartSessionEventStream } from "@/context/server-sync-session"
import { createServerSdk } from "@/context/server-sdk-client"
import { sessionDirectory } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"

// Controller for the header action; 7777 has no standalone new-session page.

let newSessionPromise: Promise<void> | undefined

export function canReuseCurrentSession(input: {
  hasSession: boolean
  messagesLoading: boolean
  messageCount: number
  prompt: string
  attachmentCount: number
}) {
  return (
    input.hasSession &&
    !input.messagesLoading &&
    input.messageCount === 0 &&
    input.prompt.trim().length === 0 &&
    input.attachmentCount === 0
  )
}

export function startNewSession() {
  if (newSessionPromise) return newSessionPromise

  if (
    canReuseCurrentSession({
      hasSession: !!state.session,
      messagesLoading: state.messagesLoading,
      messageCount: state.messages.length,
      prompt: state.prompt,
      attachmentCount: state.attachments.length,
    })
  ) {
    setState("welcomeSessionID", state.session!.id)
    return Promise.resolve()
  }

  const server = state.server
  const directory = state.session ? sessionDirectory(state.session) : undefined
  if (!server || !directory) {
    setState("error", translateSync("error.sessionNotReady"))
    return Promise.resolve()
  }

  setState("error", "")
  const baseClient = createServerSdk(server).client
  newSessionPromise = createSession(baseClient, directory, server.localAgent)
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
