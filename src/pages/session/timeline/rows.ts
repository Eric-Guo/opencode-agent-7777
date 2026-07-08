import type { Part as SdkPart } from "@opencode-ai/sdk"
import type { HistoryItem } from "@/context/global-sync/session-cache"

type TextPart = Extract<SdkPart, { type: "text" }>
type ReasoningPart = Extract<SdkPart, { type: "reasoning" }>
type ToolPart = Extract<SdkPart, { type: "tool" }>
type FilePart = Extract<SdkPart, { type: "file" }>

type TimelineMessageRow = {
  textParts: TextPart[]
  reasoningParts: ReasoningPart[]
  tools: ToolPart[]
  files: FilePart[]
  text: string
  reasoning: string[]
  copyValue: string
  hasContent: boolean
}

function isTextPart(part: SdkPart): part is TextPart {
  return part.type === "text"
}

function isReasoningPart(part: SdkPart): part is ReasoningPart {
  return part.type === "reasoning"
}

function isToolPart(part: SdkPart): part is ToolPart {
  return part.type === "tool"
}

function isFilePart(part: SdkPart): part is FilePart {
  return part.type === "file"
}

export function createTimelineMessageRow(item: HistoryItem): TimelineMessageRow {
  const textParts = item.parts.filter(isTextPart)
  const reasoningParts = item.parts.filter(isReasoningPart)
  const files = item.parts.filter(isFilePart)
  const text = textParts
    .map((part) => part.text)
    .filter((value) => value.trim().length > 0)
    .join("\n\n")
  const reasoning = reasoningParts.map((part) => part.text).filter((value) => value.trim().length > 0)

  return {
    textParts,
    reasoningParts,
    tools: item.parts.filter(isToolPart),
    files,
    text,
    reasoning,
    copyValue: text || reasoning.join("\n\n"),
    hasContent: !!text || reasoning.length > 0 || files.length > 0,
  }
}
