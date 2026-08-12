import { createMemo, type Accessor } from "solid-js"
import type { SessionMessageInfo, SessionStatus } from "@opencode-ai/client/promise"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import type { HistoryItem } from "@/context/global-sync/types"
import type { Message, UserMessage } from "@/types"
import { selectSessionUserMessages, selectVisibleSessionUserMessages } from "../session-domain"
import { createTimelineProjection } from "./projection"

const emptyParts: HistoryItem["parts"] = []

function recentDialogMessages(items: UserMessage[]) {
  if (items.length <= HISTORY_DIALOG_LIMIT) return items
  const firstVisible = items[items.length - HISTORY_DIALOG_LIMIT]
  return items.filter((item) => item.time.created >= firstVisible.time.created)
}

export function createTimelineModel(input: {
  messages: Accessor<HistoryItem[]>
  sessionMessages: Accessor<SessionMessageInfo[]>
  loading: Accessor<boolean>
  showReasoningSummaries: Accessor<boolean>
  revertMessageID?: Accessor<string | undefined>
  status?: Accessor<SessionStatus>
}) {
  const messages = createMemo(() => input.messages().map((item) => item.info) as Message[])
  const userMessages = createMemo(() => selectSessionUserMessages(messages()))
  const visibleUserMessages = createMemo(() =>
    recentDialogMessages(selectVisibleSessionUserMessages(userMessages(), input.revertMessageID?.())),
  )
  const itemByID = createMemo(() => new Map(input.messages().map((item) => [item.info.id, item] as const)))
  const projection = createTimelineProjection({
    messages,
    userMessages: visibleUserMessages,
    sessionMessages: input.sessionMessages,
    parts: (messageID) => itemByID().get(messageID)?.parts ?? emptyParts,
    status: () => input.status?.() ?? { type: "idle" },
    showReasoningSummaries: input.showReasoningSummaries,
    inlineComments: () => true,
  })
  const ready = createMemo(() => isTimelineReady(messages(), input.loading()))
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

export function isTimelineReady(messages: Message[] | undefined, loading: boolean) {
  return messages !== undefined && (messages.some((message) => message.role === "user") || !loading)
}
