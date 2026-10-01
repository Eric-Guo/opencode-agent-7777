import { createMemo, createSignal } from "solid-js"
import { createSession } from "@/runtime/server/global-sync/session-load-current"
import { translateSync } from "@/runtime/i18n/language"
import { prompt } from "@/composer/persistence-singleton"
import { currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { activateSession, restartSessionEventStream } from "@/runtime/server/sync-session-compact"
import { createServerSdk } from "@/runtime/server/client-compact"
import { sessionDirectory } from "@/session/directory"
import { readableError } from "@/shell/errors/readable"

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
      messageCount: state.sessionMessages.filter((message) => message.type === "user" || message.type === "shell")
        .length,
      prompt: prompt.current(),
      attachmentCount: prompt.attachments().length,
    })
  ) {
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
  let activation = currentRuntime()
  const current = () => currentRuntime() === activation
  newSessionPromise = createSession(baseClient, directory, server.localAgent)
    .then((session) => {
      if (!current()) return
      const loading = activateSession(server, session)
      activation = currentRuntime()
      return loading
    })
    .then(() => {
      if (current()) restartSessionEventStream()
    })
    .catch((error) => {
      if (current()) setState("error", readableError(error))
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
