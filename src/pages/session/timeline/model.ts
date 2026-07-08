import { createMemo, type Accessor } from "solid-js"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import type { HistoryItem } from "@/context/global-sync/session-cache"

const emptyHistoryItems: HistoryItem[] = []

export function selectUserMessages(items: HistoryItem[]) {
  return items.filter((item) => item.info.role === "user")
}

export function selectVisibleUserMessages(items: HistoryItem[], revertMessageID?: string) {
  if (!revertMessageID) return items
  return items.filter((item) => item.info.id < revertMessageID)
}

function recentDialogMessages(items: HistoryItem[]) {
  if (items.length <= HISTORY_DIALOG_LIMIT) return items
  const firstVisible = items[items.length - HISTORY_DIALOG_LIMIT]
  return items.filter((item) => item.info.time.created >= firstVisible.info.time.created)
}

export function projectTimelineMessages(messages: HistoryItem[], userMessages: HistoryItem[]) {
  const assistantMessagesByParent = new Map<string, HistoryItem[]>()
  for (const item of messages) {
    if (item.info.role !== "assistant") continue
    const items = assistantMessagesByParent.get(item.info.parentID)
    if (items) {
      items.push(item)
      continue
    }
    assistantMessagesByParent.set(item.info.parentID, [item])
  }

  const assistantChain = (parentID: string, seen = new Set<string>()): HistoryItem[] => {
    const assistants = assistantMessagesByParent.get(parentID) ?? emptyHistoryItems
    return assistants.flatMap((assistant) => {
      if (seen.has(assistant.info.id)) return emptyHistoryItems
      seen.add(assistant.info.id)
      return [assistant, ...assistantChain(assistant.info.id, seen)]
    })
  }

  return userMessages.flatMap((item) => [item, ...assistantChain(item.info.id)])
}

export function createTimelineModel(input: {
  messages: Accessor<HistoryItem[]>
  loading: Accessor<boolean>
  revertMessageID?: Accessor<string | undefined>
}) {
  const userMessages = createMemo(() => selectUserMessages(input.messages()))
  const visibleUserMessages = createMemo(() =>
    recentDialogMessages(selectVisibleUserMessages(userMessages(), input.revertMessageID?.())),
  )
  const visibleMessages = createMemo(() => projectTimelineMessages(input.messages(), visibleUserMessages()))
  const ready = createMemo(() => isTimelineReady(input.messages(), input.loading()))
  const userDialogCount = createMemo(() => visibleUserMessages().length)

  return {
    ready,
    userMessages,
    visibleUserMessages,
    visibleMessages,
    userDialogCount,
  }
}

export function isTimelineReady(items: HistoryItem[], loading: boolean) {
  return items.some((item) => item.info.role === "user") || !loading
}
