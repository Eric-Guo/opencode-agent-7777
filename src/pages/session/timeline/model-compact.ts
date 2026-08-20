import type { SessionDocument } from "@opencode-ai/session-ui/document"
import type { SessionMessageInfo, SessionStatus } from "@opencode-ai/client/promise"
import { createMemo, type Accessor } from "solid-js"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import { selectSessionUserMessages, selectVisibleSessionUserMessages } from "../session-domain"

function isDialogRoot(message: SessionMessageInfo) {
  return message.type === "user" || message.type === "shell"
}

function recentDialogMessages(messages: SessionMessageInfo[]) {
  const roots = messages.filter(isDialogRoot)
  if (roots.length <= HISTORY_DIALOG_LIMIT) return messages
  const firstVisible = roots[roots.length - HISTORY_DIALOG_LIMIT]
  const index = messages.findIndex((message) => message.id === firstVisible.id)
  return index < 0 ? messages : messages.slice(index)
}

export function createCompactTimelineModel(input: {
  sessionID: Accessor<string>
  messages: Accessor<SessionMessageInfo[]>
  loading: Accessor<boolean>
  revertMessageID?: Accessor<string | undefined>
  status?: Accessor<SessionStatus>
}) {
  const userMessages = createMemo(() => selectSessionUserMessages(input.messages()))
  const revertedUserMessages = createMemo(() =>
    selectVisibleSessionUserMessages(userMessages(), input.revertMessageID?.()),
  )
  const visibleMessages = createMemo(() => {
    const revertMessageID = input.revertMessageID?.()
    const messages = revertMessageID
      ? input.messages().filter((message) => message.id < revertMessageID)
      : input.messages()
    return recentDialogMessages(messages)
  })
  const visibleUserMessages = createMemo(() => {
    const visible = new Set(visibleMessages().map((message) => message.id))
    return revertedUserMessages().filter((message) => visible.has(message.id))
  })
  const document = createMemo(
    (): SessionDocument => ({
      sessionID: input.sessionID(),
      messages: visibleMessages(),
      status: input.status?.() ?? { type: "idle" },
      diffs: [],
    }),
  )
  const ready = createMemo(() => isTimelineReady(input.messages(), input.loading()))
  const userDialogCount = createMemo(() => visibleMessages().filter(isDialogRoot).length)

  return {
    document,
    ready,
    userMessages,
    visibleMessages,
    visibleUserMessages,
    userDialogCount,
  }
}

export function isTimelineReady(messages: SessionMessageInfo[] | undefined, loading: boolean) {
  return (
    messages !== undefined &&
    (messages.some((message) => message.type === "user" || message.type === "shell") || !loading)
  )
}
