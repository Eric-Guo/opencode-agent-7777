import { createMemo, type Accessor } from "solid-js"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import type { HistoryItem } from "@/context/sync"

function recentDialogMessages(items: HistoryItem[]) {
  const userMessages = items.filter((item) => item.info.role === "user")
  if (userMessages.length <= HISTORY_DIALOG_LIMIT) return items
  const firstVisible = userMessages[userMessages.length - HISTORY_DIALOG_LIMIT]
  return items.filter((item) => item.info.time.created >= firstVisible.info.time.created)
}

export function createTimelineModel(input: { messages: Accessor<HistoryItem[]> }) {
  const visibleMessages = createMemo(() => recentDialogMessages(input.messages()))
  const userDialogCount = createMemo(() => visibleMessages().filter((item) => item.info.role === "user").length)

  return {
    visibleMessages,
    userDialogCount,
  }
}
