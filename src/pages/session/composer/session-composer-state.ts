import type { FilePartInput, Part } from "@opencode-ai/sdk"
import { AGENT_ID } from "@/constants/session"
import { idleStatus, setState, state, type PromptAttachment } from "@/context/sync"
import { currentSession, scheduleRefresh } from "@/context/server-sync"
import { readableError } from "@/utils/server-errors"

function appendOptimisticMessage(text: string, attachments: PromptAttachment[]) {
  const active = currentSession()
  if (!active) return
  const id = `local-${Date.now()}`
  const parts: Part[] = [
    ...(text
      ? [
          {
            id: `${id}-text`,
            sessionID: active.sessionID,
            messageID: id,
            type: "text" as const,
            text,
          },
        ]
      : []),
    ...attachments.map((attachment, index) => ({
      id: `${id}-file-${index}`,
      sessionID: active.sessionID,
      messageID: id,
      type: "file" as const,
      mime: attachment.mime,
      filename: attachment.filename,
      url: attachment.url,
    })),
  ]
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
      parts,
    },
  ])
}

export function setPrompt(value: string) {
  setState("prompt", value)
}

export function addAttachment(attachment: PromptAttachment) {
  setState("attachments", (attachments) => [...attachments, attachment])
}

export function removeAttachment(id: string) {
  setState("attachments", (attachments) => attachments.filter((attachment) => attachment.id !== id))
}

export function submitPrompt() {
  const active = currentSession()
  const text = state.prompt.trim()
  const attachments = [...state.attachments]
  if (!active || state.submitting || (!text && attachments.length === 0)) return

  const parts = [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...attachments.map(
      (attachment): FilePartInput => ({
        type: "file",
        mime: attachment.mime,
        filename: attachment.filename,
        url: attachment.url,
      }),
    ),
  ]

  setState("prompt", "")
  setState("attachments", [])
  setState("error", "")
  setState("submitting", true)
  setState("sessionStatus", { type: "busy" })
  appendOptimisticMessage(text, attachments)

  void active.client.session
    .promptAsync({
      path: { id: active.sessionID },
      body: {
        agent: AGENT_ID,
        model: state.selectedModel,
        parts,
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
