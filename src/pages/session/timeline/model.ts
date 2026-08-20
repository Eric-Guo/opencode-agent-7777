import { createMemo, type Accessor } from "solid-js"
import { Equal } from "effect"
import type { SessionMessageInfo, SessionStatus } from "@opencode-ai/client/promise"
import { createReactiveTimelineProjection, TimelineRow } from "@opencode-ai/session-ui/timeline/projection"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import type { HistoryItem } from "@/context/global-sync/types"
import type { Message, UserMessage } from "@/types"
import { selectSessionUserMessages, selectVisibleSessionUserMessages } from "../session-domain"
import { TimelineDiffSummary } from "./timeline-row"
import { uniqueSummaryDiffs } from "./summary-diffs"

export type MessageTimelineRow = TimelineRow.TimelineRow | TimelineDiffSummary

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
  const visibleSessionMessages = createMemo(() => {
    const visible = new Set(visibleUserMessages().map((message) => message.id))
    return sliceVisibleTurns(input.sessionMessages(), visible)
  })
  const status = (): SessionStatus => input.status?.() ?? { type: "idle" }
  const projection = createReactiveTimelineProjection({
    sessionMessages: visibleSessionMessages,
    status,
    showReasoningSummaries: input.showReasoningSummaries,
  })
  const rows = createDiffSummaryRows(projection, visibleUserMessages, status)
  const ready = createMemo(() => isTimelineReady(messages(), input.loading()))
  const userDialogCount = createMemo(() => visibleUserMessages().length)

  return {
    ...projection,
    rows,
    ready,
    userMessages,
    visibleUserMessages,
    visibleMessages: rows,
    visibleRows: rows,
    userDialogCount,
  }
}

export function isTimelineReady(messages: Message[] | undefined, loading: boolean) {
  return messages !== undefined && (messages.some((message) => message.role === "user") || !loading)
}

function sliceVisibleTurns(messages: SessionMessageInfo[], visible: ReadonlySet<string>) {
  let turn = false
  let seen = false
  const rows = messages.filter((message) => {
    if (message.type === "user" || message.type === "shell") {
      seen = true
      turn = visible.has(message.id)
      return turn
    }
    return turn
  })
  // A list without any user or shell turn holds only leading notices; keep them.
  return seen ? rows : messages
}

function createDiffSummaryRows(
  projection: ReturnType<typeof createReactiveTimelineProjection>,
  visibleUserMessages: Accessor<UserMessage[]>,
  status: Accessor<SessionStatus>,
) {
  let cache = new Map<string, TimelineDiffSummary>()
  return createMemo((): MessageTimelineRow[] => {
    const base = projection.rows()
    const summaries = new Map(
      visibleUserMessages().flatMap((message) => {
        const diffs = uniqueSummaryDiffs(message.summary?.diffs)
        return diffs.length > 0 ? [[message.id, diffs] as const] : []
      }),
    )
    if (summaries.size === 0) {
      cache = new Map()
      return base
    }
    const idle = status().type === "idle"
    const active = projection.activeMessageID()
    const lastRowIndex = new Map<string, number>()
    base.forEach((row, index) => lastRowIndex.set(row.userMessageID, index))
    const next = new Map<string, TimelineDiffSummary>()
    const rows: MessageTimelineRow[] = []
    base.forEach((row, index) => {
      rows.push(row)
      if (lastRowIndex.get(row.userMessageID) !== index) return
      const diffs = summaries.get(row.userMessageID)
      if (!diffs) return
      if (!idle && row.userMessageID === active) return
      const cached = cache.get(row.userMessageID)
      const summary =
        cached && Equal.equals(cached.diffs, diffs)
          ? cached
          : new TimelineDiffSummary({ userMessageID: row.userMessageID, diffs })
      next.set(row.userMessageID, summary)
      rows.push(summary)
    })
    cache = next
    return rows
  })
}
