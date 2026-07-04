import type { FilePartInput, Part } from "@opencode-ai/sdk"
import { AGENT_ID } from "@/constants/session"
import type { ModelSelection } from "@/context/local"
import type { PromptAttachment } from "@/context/server-session"

export function buildRequestParts(input: {
  text: string
  attachments: PromptAttachment[]
  sessionID: string
}) {
  const requestParts = [
    ...(input.text ? [{ type: "text" as const, text: input.text }] : []),
    ...input.attachments.map(
      (attachment): FilePartInput => ({
        type: "file",
        mime: attachment.mime,
        filename: attachment.sourcePath ?? attachment.filename,
        url: attachment.url,
      }),
    ),
  ]

  const localMessageID = `local-${Date.now()}`
  const optimisticParts: Part[] = [
    ...(input.text
      ? [
          {
            id: `${localMessageID}-text`,
            sessionID: input.sessionID,
            messageID: localMessageID,
            type: "text" as const,
            text: input.text,
          },
        ]
      : []),
    ...input.attachments.map((attachment, index) => ({
      id: `${localMessageID}-file-${index}`,
      sessionID: input.sessionID,
      messageID: localMessageID,
      type: "file" as const,
      mime: attachment.mime,
      filename: attachment.sourcePath ?? attachment.filename,
      url: attachment.url,
    })),
  ]

  return {
    localMessageID,
    requestParts,
    optimisticParts,
  }
}

export function createOptimisticUserMessage(input: {
  messageID: string
  sessionID: string
  model: ModelSelection | undefined
  parts: Part[]
}) {
  return {
    info: {
      id: input.messageID,
      sessionID: input.sessionID,
      role: "user" as const,
      time: { created: Date.now() },
      agent: AGENT_ID,
      model: input.model ?? { providerID: "", modelID: "" },
    },
    parts: input.parts,
  }
}
