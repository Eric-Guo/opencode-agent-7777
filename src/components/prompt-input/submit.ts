import { AGENT_ID } from "@/constants/session"
import { idleStatus, setState, state, type PromptAttachment } from "@/context/sync"
import { currentSession, scheduleRefresh } from "@/context/server-sync"
import { readableError } from "@/utils/server-errors"
import { buildRequestParts, createOptimisticUserMessage } from "./build-request-parts"

function appendOptimisticMessage(input: {
  messageID: string
  sessionID: string
  parts: ReturnType<typeof buildRequestParts>["optimisticParts"]
}) {
  const active = currentSession()
  if (!active) return

  setState("messages", (items) => [
    ...items,
    createOptimisticUserMessage({
      messageID: input.messageID,
      sessionID: input.sessionID,
      model: state.selectedModel,
      parts: input.parts,
    }),
  ])
}

export function submitPrompt() {
  const active = currentSession()
  const text = state.prompt.trim()
  const attachments = [...state.attachments]
  if (!active || state.submitting || (!text && attachments.length === 0)) return

  const parts = buildRequestParts({
    text,
    attachments,
    sessionID: active.sessionID,
  })

  setState("prompt", "")
  setState("attachments", [])
  setState("error", "")
  setState("submitting", true)
  setState("sessionStatus", { type: "busy" })
  appendOptimisticMessage({
    messageID: parts.localMessageID,
    sessionID: active.sessionID,
    parts: parts.optimisticParts,
  })

  void active.client.session
    .promptAsync({
      path: { id: active.sessionID },
      body: {
        agent: AGENT_ID,
        model: state.selectedModel,
        parts: parts.requestParts,
      },
    })
    .then(() => scheduleRefresh(250))
    .catch((error) => {
      setState("error", readableError(error))
      setState("sessionStatus", idleStatus)
      scheduleRefresh(0)
    })
    .finally(() => setState("submitting", false))
}

export function abortPrompt() {
  const active = currentSession()
  if (!active) return
  void active.client.session
    .abort({
      path: { id: active.sessionID },
    })
    .catch((error) => setState("error", readableError(error)))
    .finally(() => {
      setState("submitting", false)
      scheduleRefresh()
    })
}
