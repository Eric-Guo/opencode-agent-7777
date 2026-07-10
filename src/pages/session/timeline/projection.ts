import type { HistoryItem } from "@/context/global-sync/session-cache"
import { createTimelineMessageRow } from "./rows"

type AssistantHistoryItem = HistoryItem & {
  info: HistoryItem["info"] & { role: "assistant"; parentID: string }
}

const emptyHistoryItems: HistoryItem[] = []

function isAssistantMessage(item: HistoryItem): item is AssistantHistoryItem {
  return item.info.role === "assistant"
}

export function projectTimelineMessages(messages: HistoryItem[], userMessages: HistoryItem[]) {
  const assistantMessagesByParent = messages.filter(isAssistantMessage).reduce((result, item) => {
    const items = result.get(item.info.parentID)
    if (items) {
      items.push(item)
      return result
    }
    result.set(item.info.parentID, [item])
    return result
  }, new Map<string, HistoryItem[]>())

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

export function projectTimelineRows(messages: HistoryItem[], userMessages: HistoryItem[]) {
  return projectTimelineMessages(messages, userMessages).map(createTimelineMessageRow)
}
