import type { SessionStatus } from "@opencode-ai/sdk"
import type { HistoryItem } from "@/context/global-sync/session-cache"
import { createTimelineMessageRow } from "./rows"
import { TimelineRow } from "./timeline-row"

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

export function projectTimelineRows(
  messages: HistoryItem[],
  userMessages: HistoryItem[],
  status: SessionStatus = { type: "idle" },
) {
  const projected = projectTimelineMessages(messages, userMessages)
  const lastUserMessageID = userMessages.at(-1)?.info.id

  return projected.flatMap<TimelineRow.TimelineRow>((item, index) => {
    if (item.info.role === "user") {
      const rows: TimelineRow.TimelineRow[] = []
      if (index > 0) rows.push({ _tag: "TurnGap", userMessageID: item.info.id })
      rows.push(createTimelineMessageRow(item))
      if (item.parts.some((part) => part.type === "compaction")) {
        rows.push({ _tag: "TurnDivider", userMessageID: item.info.id, label: "compaction" })
      }
      const next = projected[index + 1]
      if (status.type === "retry" && item.info.id === lastUserMessageID && next?.info.role !== "assistant") {
        rows.push({ _tag: "Retry", userMessageID: item.info.id })
      }
      return rows
    }

    const rows: TimelineRow.TimelineRow[] = [createTimelineMessageRow(item)]
    if (item.info.error?.name === "MessageAbortedError") {
      rows.push({ _tag: "TurnDivider", userMessageID: item.info.parentID, label: "interrupted" })
    }
    if (status.type === "retry" && index === projected.length - 1 && lastUserMessageID) {
      rows.push({ _tag: "Retry", userMessageID: lastUserMessageID })
    }
    return rows
  })
}
