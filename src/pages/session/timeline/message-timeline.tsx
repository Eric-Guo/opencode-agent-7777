import {
  ContextToolGroup,
  Message as SharedMessage,
  MessageDivider,
  Part as MessagePart,
  partDefaultOpen,
  type UserActions,
} from "@opencode-ai/session-ui/message-part"
import { SessionRetry } from "@opencode-ai/session-ui/session-retry"
import { Card } from "@opencode-ai/ui/card"
import { TextReveal } from "@opencode-ai/ui/text-reveal"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"
import { createMemo, For, Show, type Accessor, type ComponentProps, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type { SessionMessageInfo, SessionStatus } from "@opencode-ai/client/promise"
import { useLanguage } from "@/context/language"
import type { HistoryItem } from "@/context/global-sync/types"
import type { AssistantMessage, ToolPart } from "@/types"
import { TimelineRow, type TimelineRowMap } from "./rows"

type SharedMessageProps = ComponentProps<typeof SharedMessage>
type SharedPartProps = ComponentProps<typeof MessagePart>
type SharedContextProps = ComponentProps<typeof ContextToolGroup>
type FramedTimelineRow = Exclude<TimelineRow.TimelineRow, { _tag: "TurnGap" }>
type TimelineRowByTag<T extends TimelineRow.TimelineRow["_tag"]> = Extract<TimelineRow.TimelineRow, { _tag: T }>

const emptyAssistantMessages: AssistantMessage[] = []
const emptyTools: ToolPart[] = []

function TimelineThinkingRow(props: { reasoningHeading?: string; showReasoningSummaries: boolean }) {
  const language = useLanguage()

  return (
    <div data-slot="session-turn-thinking">
      <TextShimmer text={language.t("ui.sessionTurn.status.thinking")} />
      <Show when={!props.showReasoningSummaries}>
        <TextReveal text={props.reasoningHeading} class="session-turn-thinking-heading" travel={25} duration={700} />
      </Show>
    </div>
  )
}

type MessageTimelineProps = {
  rows: TimelineRow.TimelineRow[]
  items: HistoryItem[]
  sessionMessageByID: ReadonlyMap<string, SessionMessageInfo>
  activeMessageID?: string
  actions?: UserActions
  showReasoningSummaries: boolean
  sessionStatus: SessionStatus
  onPointerGesture?: (target?: EventTarget | null) => void
}

export function MessageTimeline(props: MessageTimelineProps) {
  const language = useLanguage()
  const [toolOpen, setToolOpen] = createStore<Record<string, boolean | undefined>>({})
  const itemByID = createMemo(() => new Map(props.items.map((item) => [item.info.id, item] as const)))
  const messageByID = createMemo(() => new Map(props.items.map((item) => [item.info.id, item.info] as const)))
  const assistantMessagesByParent = createMemo(() => {
    const result = new Map<string, AssistantMessage[]>()
    props.items.forEach((item) => {
      if (item.info.role !== "assistant") return
      const messages = result.get(item.info.parentID)
      if (messages) {
        messages.push(item.info)
        return
      }
      result.set(item.info.parentID, [item.info])
    })
    return result
  })
  const lastAssistantGroupKey = createMemo(() => {
    const result = new Map<string, string>()
    props.rows.forEach((row) => {
      if (row._tag === "AssistantPart") result.set(row.userMessageID, row.group.key)
    })
    return result
  })

  const getMessageParts = (messageID: string) => itemByID().get(messageID)?.parts ?? []
  const getMessagePart = (messageID: string, partID: string) =>
    getMessageParts(messageID).find((part) => part.id === partID)
  const workingTurn = (userMessageID: string) =>
    props.sessionStatus.type !== "idle" && props.activeMessageID === userMessageID

  const noticeContent = (message: SessionMessageInfo) => {
    if (message.type === "agent-switched")
      return {
        label: language.t("ui.tool.agent.default"),
        data: message.previous ? `${message.previous} → ${message.agent}` : message.agent,
      }
    if (message.type === "model-switched")
      return {
        label: language.t("command.category.model"),
        data: `${message.model.providerID}/${message.model.id}`,
      }
    if (message.type === "location-switched")
      return { label: language.t("ui.patch.action.moved"), data: message.location.directory }
    if (message.type === "skill") return { label: language.t("ui.tool.skill"), data: message.name }
    if (message.type === "system") return { label: message.description ?? message.text }
    if (message.type === "compaction") return { label: language.t("ui.messagePart.compaction"), data: message.status }
    if (message.type !== "synthetic") return
    if (message.description === "Continuing after restart") return { label: message.description }
    const source = typeof message.metadata?.source === "string" ? message.metadata.source : undefined
    const state = typeof message.metadata?.state === "string" ? message.metadata.state : undefined
    if (source === "subagent" || source === "shell") {
      const agent = typeof message.metadata?.agent === "string" ? message.metadata.agent : undefined
      const actor = source === "shell" ? language.t("ui.tool.shell") : (agent ?? language.t("ui.tool.agent.default"))
      const label = language.t(
        state === "error"
          ? "session.timeline.notice.failed"
          : state === "cancelled"
            ? "session.timeline.notice.cancelled"
            : "session.timeline.notice.finished",
        { actor },
      )
      return { label, data: message.description }
    }
    return { label: message.description ?? message.text }
  }

  const turnDurationMs = (userMessageID: string) => {
    const message = messageByID().get(userMessageID)
    if (!message || message.role !== "user") return
    const end = (assistantMessagesByParent().get(userMessageID) ?? emptyAssistantMessages).reduce<number | undefined>(
      (max, item) => {
        const completed = item.time.completed
        if (typeof completed !== "number") return max
        if (max === undefined) return completed
        return Math.max(max, completed)
      },
      undefined,
    )
    if (typeof end !== "number" || end < message.time.created) return
    return end - message.time.created
  }

  const assistantCopyPartID = (userMessageID: string) => {
    if (workingTurn(userMessageID)) return null
    const messages = assistantMessagesByParent().get(userMessageID) ?? emptyAssistantMessages

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (!message) continue
      const parts = getMessageParts(message.id)
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j]
        if (!part || part.type !== "text" || !part.text?.trim()) continue
        return part.id
      }
    }
  }

  const renderAssistantPartGroup = (row: Accessor<TimelineRowMap["AssistantPart"]>) => {
    if (row().group.type === "context") {
      const parts = createMemo(() => {
        const group = row().group
        if (group.type !== "context") return emptyTools
        return group.refs
          .map((ref) => getMessagePart(ref.messageID, ref.partID))
          .filter((part): part is ToolPart => part?.type === "tool")
      })
      const contextOpenKey = () => `context:${row().group.key}`
      const open = createMemo(() => toolOpen[contextOpenKey()] === true)

      return (
        <ContextToolGroup
          parts={parts() as SharedContextProps["parts"]}
          open={open()}
          onOpenChange={(value) => setToolOpen(contextOpenKey(), value)}
          busy={
            workingTurn(row().userMessageID) && lastAssistantGroupKey().get(row().userMessageID) === row().group.key
          }
        />
      )
    }

    const message = createMemo(() => {
      const group = row().group
      if (group.type !== "part") return
      return messageByID().get(group.ref.messageID)
    })
    const part = createMemo(() => {
      const group = row().group
      if (group.type !== "part") return
      return getMessagePart(group.ref.messageID, group.ref.partID)
    })
    const defaultOpen = createMemo(() => {
      const item = part()
      if (!item) return
      return partDefaultOpen(item as SharedPartProps["part"])
    })

    return (
      <Show when={message()}>
        {(message) => (
          <Show when={part()}>
            {(part) => (
              <MessagePart
                part={part() as SharedPartProps["part"]}
                message={message() as SharedPartProps["message"]}
                showAssistantCopyPartID={assistantCopyPartID(row().userMessageID)}
                turnDurationMs={turnDurationMs(row().userMessageID)}
                useV2Actions
                defaultOpen={defaultOpen()}
                toolOpen={toolOpen[part().id] ?? defaultOpen()}
                onToolOpenChange={(open) => setToolOpen(part().id, open)}
                deferToolContent
                virtualizeDiff={false}
              />
            )}
          </Show>
        )}
      </Show>
    )
  }

  function TimelineRowFrame(input: { row: Accessor<FramedTimelineRow>; children: JSX.Element }) {
    const previousAssistantPart = () => {
      const row = input.row()
      return row._tag === "AssistantPart" && row.previousAssistantPart
    }

    return (
      <div
        data-slot="timeline-row"
        data-message-id={input.row().userMessageID}
        data-timeline-row={input.row()._tag}
        classList={{
          "mx-auto min-w-0 w-full max-w-[1000px]": true,
          "pt-3": previousAssistantPart(),
        }}
      >
        <div data-component="session-turn" class="min-w-0 w-full relative" style={{ height: "auto" }}>
          {input.children}
        </div>
      </div>
    )
  }

  const renderTimelineRow = (row: Accessor<TimelineRow.TimelineRow>) => {
    switch (row()._tag) {
      case "TurnGap":
        return <div data-timeline-row="TurnGap" aria-hidden="true" class="h-6" />
      case "CommentStrip":
        return null
      case "UserMessage": {
        const userMessageRow = row as Accessor<TimelineRowByTag<"UserMessage">>
        const item = createMemo(() => itemByID().get(userMessageRow().userMessageID))
        return (
          <TimelineRowFrame row={userMessageRow}>
            <Show when={item()}>
              {(item) => (
                <div data-slot="session-turn-message-container" class="w-full">
                  <div data-slot="session-turn-message-content" aria-live="off">
                    <SharedMessage
                      message={item().info as SharedMessageProps["message"]}
                      parts={item().parts as SharedMessageProps["parts"]}
                      actions={props.actions}
                      useV2Actions
                    />
                  </div>
                </div>
              )}
            </Show>
          </TimelineRowFrame>
        )
      }
      case "Notice": {
        const noticeRow = row as Accessor<TimelineRowByTag<"Notice">>
        const content = createMemo(() => {
          const message = props.sessionMessageByID.get(noticeRow().messageID)
          return message ? noticeContent(message) : undefined
        })
        return (
          <TimelineRowFrame row={noticeRow}>
            <Show when={content()}>
              {(content) => (
                <div data-slot="session-timeline-notice" class="w-full pt-3 pb-1 text-13-regular">
                  <span class="text-13-medium text-text-strong">{content().label}</span>
                  <Show when={content().data}>{(data) => <span class="text-text-weak"> · {data()}</span>}</Show>
                </div>
              )}
            </Show>
          </TimelineRowFrame>
        )
      }
      case "TurnDivider": {
        const turnDividerRow = row as Accessor<TimelineRowByTag<"TurnDivider">>
        return (
          <TimelineRowFrame row={turnDividerRow}>
            <div data-slot="session-turn-message-container" class="w-full">
              <div data-slot="session-turn-compaction">
                <MessageDivider
                  label={language.t(
                    turnDividerRow().label === "compaction" ? "ui.messagePart.compaction" : "ui.message.interrupted",
                  )}
                />
              </div>
            </div>
          </TimelineRowFrame>
        )
      }
      case "AssistantPart": {
        const assistantPartRow = row as Accessor<TimelineRowByTag<"AssistantPart">>
        return (
          <TimelineRowFrame row={assistantPartRow}>
            <div data-slot="session-turn-message-container" class="w-full">
              <div
                data-slot="session-turn-assistant-content"
                aria-hidden={workingTurn(assistantPartRow().userMessageID)}
              >
                {renderAssistantPartGroup(assistantPartRow)}
              </div>
            </div>
          </TimelineRowFrame>
        )
      }
      case "Thinking": {
        const thinkingRow = row as Accessor<TimelineRowByTag<"Thinking">>
        return (
          <TimelineRowFrame row={thinkingRow}>
            <div data-slot="session-turn-message-container" class="w-full">
              <TimelineThinkingRow
                reasoningHeading={thinkingRow().reasoningHeading}
                showReasoningSummaries={props.showReasoningSummaries}
              />
            </div>
          </TimelineRowFrame>
        )
      }
      case "Retry": {
        const retryRow = row as Accessor<TimelineRowByTag<"Retry">>
        return (
          <TimelineRowFrame row={retryRow}>
            <div data-slot="session-turn-message-container" class="w-full">
              <SessionRetry status={props.sessionStatus} show={props.activeMessageID === retryRow().userMessageID} />
            </div>
          </TimelineRowFrame>
        )
      }
      case "DiffSummary": {
        const diffSummaryRow = row as Accessor<TimelineRowByTag<"DiffSummary">>
        return (
          <TimelineRowFrame row={diffSummaryRow}>
            <div data-slot="session-turn-message-container" class="w-full">
              <Card>
                {language.t(
                  diffSummaryRow().diffs.length === 1
                    ? "ui.sessionTurn.diffs.changed.one"
                    : "ui.sessionTurn.diffs.changed.other",
                  { count: String(diffSummaryRow().diffs.length) },
                )}
              </Card>
            </div>
          </TimelineRowFrame>
        )
      }
      case "Error": {
        const errorRow = row as Accessor<TimelineRowByTag<"Error">>
        return (
          <TimelineRowFrame row={errorRow}>
            <div data-slot="session-turn-message-container" class="w-full">
              <Card variant="error" class="error-card">
                {errorRow().text}
              </Card>
            </div>
          </TimelineRowFrame>
        )
      }
    }
  }

  const handlePointerDown = (event: PointerEvent) => props.onPointerGesture?.(event.target)
  const handlePointerMove = (event: PointerEvent) => {
    if (event.buttons !== 1) return
    props.onPointerGesture?.(event.target)
  }

  return (
    <div data-slot="session-message-timeline" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}>
      <For each={props.rows}>{(row) => renderTimelineRow(() => row)}</For>
    </div>
  )
}
