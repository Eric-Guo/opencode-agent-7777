import { AGENT_ID } from "@/constants/session"
import { readableError } from "@/pages/session/helpers"
import { currentSession, scheduleRefresh } from "@/pages/session/session-sync"
import { idleStatus, setState, state } from "@/pages/session/session-state"

function appendOptimisticMessage(text: string) {
  const active = currentSession()
  if (!active) return
  const id = `local-${Date.now()}`
  setState("messages", (items) => [
    ...items,
    {
      info: {
        id,
        sessionID: active.sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: AGENT_ID,
        model: state.selectedModel ?? { providerID: "", modelID: "" },
      },
      parts: [
        {
          id: `${id}-text`,
          sessionID: active.sessionID,
          messageID: id,
          type: "text",
          text,
        },
      ],
    },
  ])
}

export function setPrompt(value: string) {
  setState("prompt", value)
}

export function submitPrompt() {
  const active = currentSession()
  const text = state.prompt.trim()
  if (!active || !text || state.submitting) return

  setState("prompt", "")
  setState("error", "")
  setState("submitting", true)
  setState("sessionStatus", { type: "busy" })
  appendOptimisticMessage(text)

  void active.client.session
    .promptAsync({
      path: { id: active.sessionID },
      body: {
        agent: AGENT_ID,
        model: state.selectedModel,
        parts: [{ type: "text", text }],
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
