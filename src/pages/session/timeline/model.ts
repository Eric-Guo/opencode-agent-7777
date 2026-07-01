import { createMemo, type Accessor } from "solid-js"
import { recentDialogMessages, type HistoryItem } from "@/pages/session/helpers"

export function createTimelineModel(input: { messages: Accessor<HistoryItem[]> }) {
  const visibleMessages = createMemo(() => recentDialogMessages(input.messages()))
  const userDialogCount = createMemo(() => visibleMessages().filter((item) => item.info.role === "user").length)

  return {
    visibleMessages,
    userDialogCount,
  }
}
