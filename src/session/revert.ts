import { createStore } from "solid-js/store"
import type { Accessor } from "solid-js"
import type { SessionMessageUser } from "@opencode/client/promise"
import { prompt } from "@/composer/persistence-singleton"
import { extractPromptFromMessage } from "@/composer/prompt"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { refreshMessages } from "@/runtime/server/global-sync/session-cache-messages"
import { currentSession, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { selectSessionUserMessages } from "./session-domain"

export function createSessionRevert(input: { disabled?: Accessor<boolean> } = {}) {
  const [mutation, setMutation] = createStore({ pending: false })
  // The embedded app rewinds only parked, hydrated history. Pending follow-ups
  // must be sent or removed first, since they were written against that history.
  const disabled = () =>
    mutation.pending ||
    input.disabled?.() ||
    state.status !== "ready" ||
    !state.session ||
    state.submitting ||
    state.messagesLoading ||
    state.sessionStatus.type !== "idle" ||
    state.sessionPending.length > 0
  const messages = () => selectSessionUserMessages(state.sessionMessages)
  const boundary = () => {
    const reverted = state.session?.revert?.messageID
    return reverted ? messages().findIndex((message) => message.id === reverted) : messages().length
  }
  const canUndo = () => !disabled() && boundary() > 0
  const canRedo = () => !disabled() && !!state.session?.revert && boundary() >= 0

  const change = async (message?: SessionMessageUser) => {
    if (disabled()) return
    const active = currentSession()
    if (!active) return
    // Each activation owns a new client, including switching away and back to
    // the same session. Its response must not overwrite the new activation.
    const ownsSession = () => state.session?.id === active.sessionID && currentSession()?.client === active.client
    const draft = message ? extractPromptFromMessage(message) : undefined
    const originalParts = prompt.store[0].prompt
    const originalDraft = JSON.stringify(prompt.capture())
    setMutation("pending", true)
    setState("error", "")
    try {
      const result = message
        ? await active.client.session.revert.stage({ sessionID: active.sessionID, messageID: message.id })
        : await active.client.session.revert.clear({ sessionID: active.sessionID })
      if (!ownsSession()) return
      setState("session", (session) =>
        session ? { ...session, revert: result ? structuredClone(result) : undefined } : session,
      )
      // The editor is disabled during the request, but other draft writers
      // (for example welcome suggestions) can still run while it is in flight.
      if (prompt.store[0].prompt === originalParts && JSON.stringify(prompt.capture()) === originalDraft)
        prompt.restore(draft)
      await refreshMessages(FETCH_MESSAGE_LIMIT)
    } catch (error) {
      if (ownsSession()) setState("error", readableError(error))
    } finally {
      setMutation("pending", false)
    }
  }

  const to = (messageID: string) => {
    const message = messages().find((item) => item.id === messageID)
    if (message) return change(message)
  }
  const undo = () => {
    if (canUndo()) return change(messages()[boundary() - 1])
  }
  const redo = () => {
    if (canRedo()) return change(messages()[boundary() + 1])
  }

  return { to, undo, redo, canUndo, canRedo, busy: () => mutation.pending }
}

export type SessionRevert = ReturnType<typeof createSessionRevert>
