import { createMemo, type Accessor } from "solid-js"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import type { HistoryItem } from "@/context/server-session"

function applyRevertBoundary(items: HistoryItem[], revertMessageID?: string) {
  if (!revertMessageID) return items
  return items.filter((item) => item.info.id < revertMessageID)
}

function recentDialogMessages(items: HistoryItem[]) {
  const userMessages = items.filter((item) => item.info.role === "user")
  if (userMessages.length <= HISTORY_DIALOG_LIMIT) return items
  const firstVisible = userMessages[userMessages.length - HISTORY_DIALOG_LIMIT]
  return items.filter((item) => item.info.time.created >= firstVisible.info.time.created)
}

export function createTimelineModel(input: {
  messages: Accessor<HistoryItem[]>
  loading: Accessor<boolean>
  revertMessageID?: Accessor<string | undefined>
}) {
  const visibleMessages = createMemo(() =>
    recentDialogMessages(applyRevertBoundary(input.messages(), input.revertMessageID?.())),
  )
  const ready = createMemo(() => isTimelineReady(input.messages(), input.loading()))
  const userDialogCount = createMemo(() => visibleMessages().filter((item) => item.info.role === "user").length)

  return {
    ready,
    visibleMessages,
    userDialogCount,
  }
}

export function isTimelineReady(items: HistoryItem[], loading: boolean) {
  return items.some((item) => item.info.role === "user") || !loading
}
