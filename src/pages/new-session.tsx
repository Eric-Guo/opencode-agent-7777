import { createMemo, createSignal } from "solid-js"
import type { Session } from "@opencode-ai/sdk"
import { createSession } from "@/context/global-sync/session-load"
import { translateSync } from "@/context/language"
import { setState, state } from "@/context/server-session"
import { activateSession, restartSessionEventStream } from "@/context/server-sync"
import { makeClient } from "@/context/sdk"
import { hideBlankRecentSession } from "@/pages/session/recent-sessions"
import { readableError } from "@/utils/server-errors"

let newSessionPromise: Promise<void> | undefined
const defaultTitlePattern = /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function hasSessionDisplayMetadata(session: Session) {
  const title = session.title.trim()
  if (title && title !== "7777" && !defaultTitlePattern.test(title)) return true
  return !!session.summary
}

function hasCurrentSessionContent() {
  return state.messages.some((message) =>
    message.info.role === "user" &&
      message.parts.some((part) => part.type !== "compaction" && part.type !== "step-start" && part.type !== "step-finish"),
  )
}

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
  const previousSession = state.session
  const selectedModel = state.selectedModel
  const previousSessionHasContent = hasCurrentSessionContent()
  if (previousSession && !previousSessionHasContent) hideBlankRecentSession(previousSession.id)

  newSessionPromise = createSession(baseClient, directory)
    .then((session) => activateSession(server, session))
    .then(() => {
      restartSessionEventStream()
      if (previousSession && selectedModel && previousSessionHasContent && !hasSessionDisplayMetadata(previousSession)) {
        void baseClient.session
          .summarize({
            path: { id: previousSession.id },
            query: { directory },
            body: {
              providerID: selectedModel.providerID,
              modelID: selectedModel.modelID,
            },
          })
          .catch((error) => {
            console.warn("[7777] failed to summarize previous session after creating a new session", error)
          })
      }
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
