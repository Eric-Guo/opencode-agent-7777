import type { Part, SessionPromptInput } from "@opencode-ai/client"
import type { ModelSelection } from "@/context/local"
import type { PromptAttachment } from "@/context/prompt"

export function buildRequestParts(input: { text: string; attachments: PromptAttachment[]; sessionID: string }) {
  const requestFiles: NonNullable<SessionPromptInput["files"]> = input.attachments.map((attachment) => ({
    uri: attachment.url,
    name: attachment.sourcePath ?? attachment.filename,
  }))

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
    requestFiles,
    optimisticParts,
  }
}

export function createOptimisticUserMessage(input: {
  messageID: string
  sessionID: string
  localAgent: string
  model: ModelSelection | undefined
  parts: Part[]
}) {
  return {
    info: {
      id: input.messageID,
      sessionID: input.sessionID,
      role: "user" as const,
      time: { created: Date.now() },
      agent: input.localAgent,
      model: input.model ?? { providerID: "", modelID: "" },
    },
    parts: input.parts,
  }
}
