import { Timeline, TimelineRow } from "@opencode-ai/session-ui/timeline/projection"
import {
  MessageDivider,
  SessionAssistantContent,
  SessionContextToolGroup,
  SessionShellMessage,
  SessionUserMessage,
  currentContentDefaultOpen,
  type SessionUserActions,
  type SessionUserComment,
} from "@opencode-ai/session-ui/message"
import { SessionRetry } from "@opencode-ai/session-ui/session-retry"
import { Card } from "@opencode-ai/ui/card"
import { TextReveal } from "@opencode-ai/ui/text-reveal"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"
import { createMemo, For, Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type {
  ModelRef,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageUser,
  SessionStatus,
} from "@opencode-ai/client/promise"
import { useLanguage } from "@/context/language"
import { parseCommentNote, readCommentMetadata } from "@/utils/comment-note"
import type { MessageTimelineRow } from "./model"
import { TimelineDiffSummary } from "./timeline-row"

const emptyAssistantMessages: SessionMessageAssistant[] = []
const emptyTools: SessionMessageAssistantTool[] = []

type RowByTag<T extends TimelineRow.TimelineRow["_tag"]> = Extract<TimelineRow.TimelineRow, { _tag: T }>

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
  rows: MessageTimelineRow[]
  sessionID: string
  messageByID: ReadonlyMap<string, SessionMessageInfo>
  userContextByID: ReadonlyMap<string, { agent: string; model: ModelRef }>
  assistantMessagesByParent: ReadonlyMap<string, SessionMessageAssistant[]>
  lastAssistantGroupKey: ReadonlyMap<string, string>
  activeMessageID?: string
  actions?: SessionUserActions
  showReasoningSummaries: boolean
  sessionStatus: SessionStatus
  onPointerGesture?: (target?: EventTarget | null) => void
}

export function MessageTimeline(props: MessageTimelineProps) {
  const language = useLanguage()
  const [toolOpen, setToolOpen] = createStore<Record<string, boolean | undefined>>({})
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
    const message = props.messageByID.get(userMessageID)
    if (!message || message.type !== "user") return
    const end = (props.assistantMessagesByParent.get(userMessageID) ?? emptyAssistantMessages).reduce<
      number | undefined
    >((max, item) => {
      const completed = item.time.completed
      if (typeof completed !== "number") return max
      if (max === undefined) return completed
      return Math.max(max, completed)
    }, undefined)
    if (typeof end !== "number" || end < message.time.created) return
    return end - message.time.created
  }

  const assistantCopyContentID = (userMessageID: string) => {
    if (workingTurn(userMessageID)) return null
    return (props.assistantMessagesByParent.get(userMessageID) ?? emptyAssistantMessages)
      .toReversed()
      .flatMap((message) => Timeline.contentEntries(message).toReversed())
      .find((entry) => entry.content.type === "text" && !!entry.content.text.trim())?.id
  }

  const userComments = (message: SessionMessageUser): SessionUserComment[] => {
    const comment = readCommentMetadata(message.metadata) ?? parseCommentNote(message.text)
    if (!comment) return []
    return [
      {
        path: comment.path,
        comment: comment.comment,
        selection: comment.selection
          ? { startLine: comment.selection.startLine, endLine: comment.selection.endLine }
          : undefined,
      },
    ]
  }

  const renderAssistantPartGroup = (row: Accessor<RowByTag<"AssistantPart">>) => {
    if (row().group.type === "context") {
      const tools = createMemo(() => {
        const group = row().group
        if (group.type !== "context") return emptyTools
        return group.refs.flatMap((ref) => {
          const message = props.messageByID.get(ref.messageID)
          const content = Timeline.resolveContent(message, ref.partID)
          return message?.type === "assistant" && content?.type === "tool" ? [content] : []
        })
      })
      const contextOpenKey = () => `context:${row().group.key}`

      return (
        <SessionContextToolGroup
          tools={tools()}
          open={toolOpen[contextOpenKey()] === true}
          onOpenChange={(value) => setToolOpen(contextOpenKey(), value)}
          busy={
            workingTurn(row().userMessageID) && props.lastAssistantGroupKey.get(row().userMessageID) === row().group.key
          }
        />
      )
    }

    const ref = createMemo(() => {
      const group = row().group
      return group.type === "part" ? group.ref : undefined
    })
    const message = createMemo(() => {
      const current = ref()
      const value = current ? props.messageByID.get(current.messageID) : undefined
      return value?.type === "assistant" ? value : undefined
    })
    const content = createMemo(() => {
      const current = ref()
      return current ? Timeline.resolveContent(message(), current.partID) : undefined
    })
    const defaultOpen = createMemo(() => {
      const item = content()
      if (!item) return
      return currentContentDefaultOpen(item, false, false)
    })

    return (
      <Show when={message()}>
        {(message) => (
          <Show when={content()}>
            {(content) => (
              <SessionAssistantContent
                message={message()}
                content={content()}
                contentID={ref()!.partID}
                showAssistantCopyPartID={assistantCopyContentID(row().userMessageID)}
                turnDurationMs={turnDurationMs(row().userMessageID)}
                defaultOpen={defaultOpen()}
                toolOpen={toolOpen[row().group.key] ?? defaultOpen()}
                onToolOpenChange={(open) => setToolOpen(row().group.key, open)}
              />
            )}
          </Show>
        )}
      </Show>
    )
  }

  function TimelineRowFrame(input: { row: Accessor<Exclude<MessageTimelineRow, TimelineRow.TurnGap>>; children: JSX.Element }) {
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

  const renderTimelineRow = (row: Accessor<MessageTimelineRow>) => {
    switch (row()._tag) {
      case "TurnGap":
        return <div data-timeline-row="TurnGap" aria-hidden="true" class="h-6" />
      case "UserMessage": {
        const userMessageRow = row as Accessor<RowByTag<"UserMessage">>
        const message = createMemo(() => {
          const value = props.messageByID.get(userMessageRow().userMessageID)
          return value?.type === "user" ? value : undefined
        })
        const context = createMemo(() => props.userContextByID.get(userMessageRow().userMessageID))
        return (
          <TimelineRowFrame row={userMessageRow}>
            <Show when={message()}>
              {(message) => (
                <div data-slot="session-turn-message-container" class="w-full">
                  <div data-slot="session-turn-message-content" aria-live="off">
                    <SessionUserMessage
                      sessionID={props.sessionID}
                      message={message()}
                      comments={userComments(message())}
                      historicalAgent={context()?.agent ?? ""}
                      historicalModel={context()?.model ?? { id: "", providerID: "" }}
                      actions={props.actions}
                    />
                  </div>
                </div>
              )}
            </Show>
          </TimelineRowFrame>
        )
      }
      case "Shell": {
        const shellRow = row as Accessor<RowByTag<"Shell">>
        const message = createMemo(() => {
          const value = props.messageByID.get(shellRow().messageID)
          return value?.type === "shell" ? value : undefined
        })
        return (
          <TimelineRowFrame row={shellRow}>
            <Show when={message()}>
              {(message) => (
                <div data-slot="session-turn-message-container" class="w-full">
                  <SessionShellMessage
                    message={message()}
                    defaultOpen={false}
                    open={toolOpen[message().id]}
                    onOpenChange={(open) => setToolOpen(message().id, open)}
                  />
                </div>
              )}
            </Show>
          </TimelineRowFrame>
        )
      }
      case "Notice": {
        const noticeRow = row as Accessor<RowByTag<"Notice">>
        const content = createMemo(() => {
          const message = props.messageByID.get(noticeRow().messageID)
          return message ? noticeContent(message) : undefined
        })
        return (
          <TimelineRowFrame row={noticeRow}>
            <Show when={content()}>
              {(content) => (
                <div data-slot="session-timeline-notice" class="w-full pt-3 pb-1 text-13-regular text-text-weak">
                  <span class="text-13-medium">{content().label}</span>
                  <Show when={content().data}>{(data) => <span> · {data()}</span>}</Show>
                </div>
              )}
            </Show>
          </TimelineRowFrame>
        )
      }
      case "TurnDivider": {
        const turnDividerRow = row as Accessor<RowByTag<"TurnDivider">>
        return (
          <TimelineRowFrame row={turnDividerRow}>
            <div data-slot="session-turn-message-container" class="w-full">
              <div data-slot="session-turn-compaction">
                <MessageDivider label={language.t("ui.message.interrupted")} />
              </div>
            </div>
          </TimelineRowFrame>
        )
      }
      case "AssistantPart": {
        const assistantPartRow = row as Accessor<RowByTag<"AssistantPart">>
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
        const thinkingRow = row as Accessor<RowByTag<"Thinking">>
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
        const retryRow = row as Accessor<RowByTag<"Retry">>
        return (
          <TimelineRowFrame row={retryRow}>
            <div data-slot="session-turn-message-container" class="w-full">
              <SessionRetry status={props.sessionStatus} show={props.activeMessageID === retryRow().userMessageID} />
            </div>
          </TimelineRowFrame>
        )
      }
      case "DiffSummary": {
        const diffSummaryRow = row as Accessor<TimelineDiffSummary>
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
        const errorRow = row as Accessor<RowByTag<"Error">>
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
