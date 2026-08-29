import { prompt } from "@/composer/persistence-singleton"
import { extractPromptFromMessage } from "@/composer/prompt"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { refreshMessages } from "@/runtime/server/global-sync/session-cache-messages"
import { currentSession, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"

export function createSessionRevert() {
  const to = (messageID: string) => {
    const active = currentSession()
    if (!active) return
    const message = state.sessionMessages.find((item) => item.id === messageID)
    const draft = message?.type === "user" ? extractPromptFromMessage(message) : undefined
    setState("error", "")
    return active.client.session.revert
      .stage({ sessionID: active.sessionID, messageID })
      .then((result) => {
        setState("session", "revert", result)
        if (draft) prompt.restore(draft)
        return refreshMessages(FETCH_MESSAGE_LIMIT)
      })
      .catch((error) => setState("error", readableError(error)))
  }

  return { to }
}

export type SessionRevert = ReturnType<typeof createSessionRevert>
