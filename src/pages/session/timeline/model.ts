import { createMemo, type Accessor } from "solid-js"
import type { SessionMessageInfo, SessionStatus } from "@opencode-ai/client/promise"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import type { HistoryItem } from "@/context/global-sync/types"
import type { Message, UserMessage } from "@/types"
import { createTimelineProjection } from "./projection"

type UserHistoryItem = HistoryItem & { info: UserMessage }

const emptyParts: HistoryItem["parts"] = []

export function selectUserMessages(items: HistoryItem[]) {
  return items.filter((item): item is UserHistoryItem => item.info.role === "user")
}

export function selectVisibleUserMessages(items: UserHistoryItem[], revertMessageID?: string) {
  if (!revertMessageID) return items
  return items.filter((item) => item.info.id < revertMessageID)
}

function recentDialogMessages(items: UserHistoryItem[]) {
  if (items.length <= HISTORY_DIALOG_LIMIT) return items
  const firstVisible = items[items.length - HISTORY_DIALOG_LIMIT]
  return items.filter((item) => item.info.time.created >= firstVisible.info.time.created)
}

export function createTimelineModel(input: {
  messages: Accessor<HistoryItem[]>
  sessionMessages: Accessor<SessionMessageInfo[]>
  loading: Accessor<boolean>
  showReasoningSummaries: Accessor<boolean>
  revertMessageID?: Accessor<string | undefined>
  status?: Accessor<SessionStatus>
}) {
  const userMessages = createMemo(() => selectUserMessages(input.messages()))
  const visibleUserMessages = createMemo(() =>
    recentDialogMessages(selectVisibleUserMessages(userMessages(), input.revertMessageID?.())),
  )
  const messages = createMemo(() => input.messages().map((item) => item.info) as Message[])
  const itemByID = createMemo(() => new Map(input.messages().map((item) => [item.info.id, item] as const)))
  const projection = createTimelineProjection({
    messages,
    userMessages: () => visibleUserMessages().map((item) => item.info),
    sessionMessages: input.sessionMessages,
    parts: (messageID) => itemByID().get(messageID)?.parts ?? emptyParts,
    status: () => input.status?.() ?? { type: "idle" },
    showReasoningSummaries: input.showReasoningSummaries,
    inlineComments: () => true,
  })
  const ready = createMemo(() => isTimelineReady(input.messages(), input.loading()))
  const userDialogCount = createMemo(() => visibleUserMessages().length)

  return {
    ...projection,
    ready,
    userMessages,
    visibleUserMessages,
    visibleMessages: projection.rows,
    visibleRows: projection.rows,
    userDialogCount,
  }
}

export function isTimelineReady(items: HistoryItem[], loading: boolean) {
  return items.some((item) => item.info.role === "user") || !loading
}
