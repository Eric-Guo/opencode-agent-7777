import type { SessionInboxInfo, SessionMessageInfo } from "@opencode/client/promise"

export function inboxItemMessage(item: SessionInboxInfo): SessionMessageInfo | undefined {
  if (item.type === "user")
    return {
      id: item.id,
      type: "user",
      metadata: item.payload.metadata,
      text: item.payload.text,
      files: item.payload.files,
      agents: item.payload.agents,
      skills: item.payload.skills,
      time: { created: item.time.created },
    }
  if (item.type === "synthetic")
    return {
      id: item.id,
      type: "synthetic",
      metadata: item.payload.metadata,
      text: item.payload.text,
      description: item.payload.description,
      time: { created: item.time.created },
    }
  return undefined
}
