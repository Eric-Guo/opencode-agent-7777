import type { Part as SdkPart } from "@opencode-ai/sdk"
import type { HistoryItem } from "@/context/global-sync/session-cache"

export type TimelineMessageContent = {
  textParts: Extract<SdkPart, { type: "text" }>[]
  reasoningParts: Extract<SdkPart, { type: "reasoning" }>[]
  tools: Extract<SdkPart, { type: "tool" }>[]
  files: Extract<SdkPart, { type: "file" }>[]
  text: string
  reasoning: string[]
}

export namespace TimelineRow {
  export type UserMessage = {
    _tag: "UserMessage"
    item: HistoryItem
  }

  export type AssistantMessage = {
    _tag: "AssistantMessage"
    item: HistoryItem
    content: TimelineMessageContent
  }

  export type TimelineRow = UserMessage | AssistantMessage

  export function key(row: TimelineRow) {
    return `${row._tag}:${row.item.info.id}`
  }
}
