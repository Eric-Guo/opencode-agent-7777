import type { Message, Part } from "@opencode-ai/sdk"
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
