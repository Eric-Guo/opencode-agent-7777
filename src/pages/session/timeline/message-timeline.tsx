import type { SessionStatus } from "@opencode-ai/sdk"
import { Message as SharedMessage, MessageDivider, Part, type UserActions } from "@opencode-ai/session-ui/message-part"
import { SessionRetry } from "@opencode-ai/session-ui/session-retry"
import { Icon } from "@opencode-ai/ui/icon"
import {
  createMemo,
  createSignal,
  For,
  Show,
  type Accessor,
  type ComponentProps,
  type ParentProps,
} from "solid-js"
import { useLanguage } from "@/context/language"
import { TimelineRow } from "./rows"

type SharedMessageProps = ComponentProps<typeof SharedMessage>
type SharedPartProps = ComponentProps<typeof Part>
type TimelineRowByTag<T extends TimelineRow.TimelineRow["_tag"]> = Extract<TimelineRow.TimelineRow, { _tag: T }>

function copyToClipboard(value: string) {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard
  if (clipboard?.writeText) return clipboard.writeText(value)

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.append(textarea)
  textarea.select()
  document.execCommand("copy")
  textarea.remove()
  return Promise.resolve()
}

function TimelineRowFrame(props: ParentProps<{ role: "user" | "assistant" }>) {
  return (
    <article
      class={`group mx-auto mb-2 flex max-w-[1120px] max-[720px]:mb-5 ${
        props.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div class="hidden h-8 w-8 items-center justify-center rounded-lg bg-v2-background-bg-layer-02 text-xs font-[760] leading-none text-v2-text-text-accent">
        {props.role === "user" ? "U" : "7"}
      </div>
      <div
        class={`min-w-0 max-[720px]:max-w-[min(100%,84vw)] ${
          props.role === "user" ? "max-w-[min(520px,68vw)]" : "max-w-[min(760px,74vw)]"
        }`}
      >
        {props.children}
      </div>
    </article>
  )
}

function UserMessageRow(props: { row: TimelineRow.UserMessage; actions?: UserActions }) {
  return (
    <TimelineRowFrame role="user">
      <SharedMessage
        message={props.row.item.info as SharedMessageProps["message"]}
        parts={props.row.item.parts as SharedMessageProps["parts"]}
        actions={props.actions}
        useV2Actions
      />
    </TimelineRowFrame>
  )
}

function AssistantMessageRow(props: {
  row: TimelineRow.AssistantMessage
  showReasoningSummaries: boolean
  showToolsPart: boolean
}) {
  const language = useLanguage()
  const content = () => props.row.content
  const [copied, setCopied] = createSignal(false)
  const visibleCopyValue = createMemo(
    () => content().text || (props.showReasoningSummaries ? content().reasoning.join("\n\n") : ""),
  )
  const hasVisibleContent = createMemo(
    () =>
      !!content().text ||
      content().files.length > 0 ||
      (props.showToolsPart && content().tools.length > 0) ||
      (props.showReasoningSummaries && content().reasoning.length > 0),
  )

  const handleCopy = () => {
    const value = visibleCopyValue()
    if (!value) return
    void copyToClipboard(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

  return (
    <Show when={hasVisibleContent()}>
      <TimelineRowFrame role="assistant">
        <div class="min-w-0 border-0 bg-transparent p-0 shadow-none">
          <Show when={props.showReasoningSummaries && content().reasoningParts.length > 0}>
            <div class="mb-2">
              <For each={content().reasoningParts}>
                {(part) => (
                  <Part
                    message={props.row.item.info as SharedPartProps["message"]}
                    part={part as SharedPartProps["part"]}
                    useV2Actions
                  />
                )}
              </For>
            </div>
          </Show>
          <Show when={content().files.length > 0}>
            <div class="mb-2 flex max-w-full flex-col gap-1.5">
              <For each={content().files}>
                {(part) => (
                  <Part
                    message={props.row.item.info as SharedPartProps["message"]}
                    part={part as SharedPartProps["part"]}
                    useV2Actions
                  />
                )}
              </For>
            </div>
          </Show>
          <For each={content().textParts}>
            {(part) => (
              <Part
                message={props.row.item.info as SharedPartProps["message"]}
                part={part as SharedPartProps["part"]}
                showAssistantCopyPartID={null}
                useV2Actions
              />
            )}
          </For>
          <Show when={props.showToolsPart && content().tools.length > 0}>
            <div class="mt-2 flex flex-col gap-1">
              <For each={content().tools}>
                {(part) => (
                  <Part
                    message={props.row.item.info as SharedPartProps["message"]}
                    part={part as SharedPartProps["part"]}
                    useV2Actions
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
        <div class="mt-1.5 flex min-h-6 items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <div class="min-w-0 text-xs font-semibold leading-none text-v2-text-text-faint">7777</div>
          <button
            type="button"
            class="inline-flex h-6 min-w-[32px] items-center justify-center gap-[5px] rounded-md border border-transparent bg-v2-background-bg-layer-01 px-2 py-0 text-xs font-[650] text-v2-text-text-muted hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover hover:enabled:text-v2-text-text-base disabled:opacity-45 [&_[data-component=icon]]:h-[14px] [&_[data-component=icon]]:w-[14px]"
            aria-label={language.t("timeline.copy")}
            disabled={!visibleCopyValue()}
            onClick={handleCopy}
          >
            <Icon name="copy" />
            <span>{copied() ? language.t("timeline.copied") : language.t("timeline.copy")}</span>
          </button>
        </div>
      </TimelineRowFrame>
    </Show>
  )
}

function renderTimelineRow(
  row: Accessor<TimelineRow.TimelineRow>,
  props: Pick<MessageTimelineProps, "actions" | "showReasoningSummaries" | "showToolsPart" | "sessionStatus">,
) {
  switch (row()._tag) {
    case "TurnGap":
      return <div data-timeline-row="TurnGap" aria-hidden="true" class="h-6" />
    case "UserMessage": {
      const userMessageRow = row as Accessor<TimelineRowByTag<"UserMessage">>
      return <UserMessageRow row={userMessageRow()} actions={props.actions} />
    }
    case "AssistantMessage": {
      const assistantMessageRow = row as Accessor<TimelineRowByTag<"AssistantMessage">>
      return (
        <AssistantMessageRow
          row={assistantMessageRow()}
          showReasoningSummaries={props.showReasoningSummaries}
          showToolsPart={props.showToolsPart}
        />
      )
    }
    case "TurnDivider": {
      const turnDividerRow = row as Accessor<TimelineRowByTag<"TurnDivider">>
      return (
        <TimelineRowFrame role="assistant">
          <div data-slot="session-turn-compaction">
            <MessageDivider
              label={
                turnDividerRow().label === "compaction"
                  ? "Compacted conversation"
                  : "Assistant response interrupted"
              }
            />
          </div>
        </TimelineRowFrame>
      )
    }
    case "Retry":
      return (
        <TimelineRowFrame role="assistant">
          <SessionRetry status={props.sessionStatus} show />
        </TimelineRowFrame>
      )
  }
}

function TimelineRowView(
  props: { row: TimelineRow.TimelineRow } & Pick<
    MessageTimelineProps,
    "actions" | "showReasoningSummaries" | "showToolsPart" | "sessionStatus"
  >,
) {
  return renderTimelineRow(() => props.row, props)
}

type MessageTimelineProps = {
  rows: TimelineRow.TimelineRow[]
  actions?: UserActions
  showReasoningSummaries: boolean
  showToolsPart: boolean
  sessionStatus: SessionStatus
  onPointerGesture?: (target?: EventTarget | null) => void
}

export function MessageTimeline(props: MessageTimelineProps) {
  const handlePointerDown = (event: PointerEvent) => {
    props.onPointerGesture?.(event.target)
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (event.buttons !== 1) return
    props.onPointerGesture?.(event.target)
  }

  return (
    <div data-slot="session-message-timeline" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}>
      <For each={props.rows}>
        {(row) => (
          <TimelineRowView
            row={row}
            actions={props.actions}
            showReasoningSummaries={props.showReasoningSummaries}
            showToolsPart={props.showToolsPart}
            sessionStatus={props.sessionStatus}
          />
        )}
      </For>
    </div>
  )
}
