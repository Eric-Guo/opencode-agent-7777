import type { Part as SdkPart } from "@opencode-ai/client"
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
  export type TurnGap = {
    _tag: "TurnGap"
    userMessageID: string
  }

  export type UserMessage = {
    _tag: "UserMessage"
    item: HistoryItem
  }

  export type AssistantMessage = {
    _tag: "AssistantMessage"
    item: HistoryItem
    content: TimelineMessageContent
  }

  export type TurnDivider = {
    _tag: "TurnDivider"
    userMessageID: string
    label: "compaction" | "interrupted"
  }

  export type Retry = {
    _tag: "Retry"
    userMessageID: string
  }

  export type TimelineRow = TurnGap | UserMessage | TurnDivider | AssistantMessage | Retry

  export function key(row: TimelineRow) {
    switch (row._tag) {
      case "TurnGap":
        return `turn-gap:${row.userMessageID}`
      case "UserMessage":
      case "AssistantMessage":
        return `${row._tag}:${row.item.info.id}`
      case "TurnDivider":
        return `turn-divider:${row.userMessageID}:${row.label}`
      case "Retry":
        return `retry:${row.userMessageID}`
    }
  }

  export function equals(a: TimelineRow, b: TimelineRow) {
    if (a._tag !== b._tag) return false
    return equalsValue(a, b)
  }
}

function equalsValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => equalsValue(value, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => key in right && equalsValue(left[key], right[key]))
}
