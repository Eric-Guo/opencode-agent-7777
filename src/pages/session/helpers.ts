import type { Message, Part } from "@opencode-ai/sdk"
import DOMPurify from "dompurify"
import { marked } from "marked"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"

export type HistoryItem = {
  info: Message
  parts: Part[]
}

export function normalizeHistory(items: { info: Message; parts: Part[] }[]): HistoryItem[] {
  return items
    .filter((item) => !!item.info?.id)
    .map((item) => ({
      info: item.info,
      parts: item.parts.filter((part) => !!part.id).sort(comparePart),
    }))
    .sort(compareHistoryItem)
}

export function compareHistoryItem(a: HistoryItem, b: HistoryItem) {
  const diff = a.info.time.created - b.info.time.created
  if (diff !== 0) return diff
  return a.info.id < b.info.id ? -1 : a.info.id > b.info.id ? 1 : 0
}

export function comparePart(a: Part, b: Part) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function recentDialogMessages(items: HistoryItem[]) {
  const userMessages = items.filter((item) => item.info.role === "user")
  if (userMessages.length <= HISTORY_DIALOG_LIMIT) return items
  const firstVisible = userMessages[userMessages.length - HISTORY_DIALOG_LIMIT]
  return items.filter((item) => item.info.time.created >= firstVisible.info.time.created)
}

export function readableError(error: unknown) {
  if (!error) return "Request failed"
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (typeof error === "object" && "data" in error) {
    const data = error.data
    if (typeof data === "object" && data && "message" in data && typeof data.message === "string") return data.message
  }
  return String(error)
}

export function isTextLikePart(part: Part): part is Extract<Part, { type: "text" | "reasoning" }> {
  return part.type === "text" || part.type === "reasoning"
}

export function isToolPart(part: Part): part is Extract<Part, { type: "tool" }> {
  return part.type === "tool"
}

export function messageText(parts: Part[]) {
  return parts
    .filter(isTextLikePart)
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n")
}

export function renderMarkdown(value: string) {
  const parsed = marked.parse(value, { async: false })
  return DOMPurify.sanitize(typeof parsed === "string" ? parsed : value)
}

export function toolStatus(part: Extract<Part, { type: "tool" }>) {
  if (part.state.status === "completed") return part.state.title || "Done"
  if (part.state.status === "error") return part.state.error
  if (part.state.status === "running") return part.state.title || "Running"
  return "Pending"
}
