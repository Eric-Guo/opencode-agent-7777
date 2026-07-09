import { Message as SharedMessage, Part, type UserActions } from "@opencode-ai/session-ui/message-part"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, For, Show, type ComponentProps } from "solid-js"
import type { HistoryItem } from "@/context/global-sync/session-cache"
import { useLanguage } from "@/context/language"
import { createTimelineMessageRow } from "./rows"

type SharedMessageProps = ComponentProps<typeof SharedMessage>
type SharedPartProps = ComponentProps<typeof Part>

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

function MessageView(props: {
  item: HistoryItem
  actions?: UserActions
  showReasoningSummaries: boolean
  showToolsPart: boolean
}) {
  const language = useLanguage()
  const row = createMemo(() => createTimelineMessageRow(props.item))
  const role = createMemo(() => (props.item.info.role === "user" ? language.t("timeline.role.user") : "7777"))
  const [copied, setCopied] = createSignal(false)
  const visibleCopyValue = createMemo(() => row().text || (props.showReasoningSummaries ? row().reasoning.join("\n\n") : ""))
  const hasVisibleContent = createMemo(
    () =>
      !!row().text ||
      row().files.length > 0 ||
      (props.showToolsPart && row().tools.length > 0) ||
      (props.showReasoningSummaries && row().reasoning.length > 0),
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
    <article
      class={`group mx-auto mb-2 flex max-w-[1120px] max-[720px]:mb-5 ${
        props.item.info.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div class="hidden h-8 w-8 items-center justify-center rounded-lg bg-v2-background-bg-layer-02 text-xs font-[760] leading-none text-v2-text-text-accent">
        {props.item.info.role === "user" ? "U" : "7"}
      </div>
      <div
        class={`min-w-0 max-[720px]:max-w-[min(100%,84vw)] ${
          props.item.info.role === "user" ? "max-w-[min(520px,68vw)]" : "max-w-[min(760px,74vw)]"
        }`}
      >
        <Show
          when={props.item.info.role === "user"}
          fallback={
            <>
              <div class="min-w-0 border-0 bg-transparent p-0 shadow-none">
                <Show when={hasVisibleContent()} fallback={<div class="text-v2-text-text-faint">...</div>}>
                  <Show when={props.showReasoningSummaries && row().reasoningParts.length > 0}>
                    <div class="mb-2">
                      <For each={row().reasoningParts}>
                        {(part) => (
                          <Part
                            message={props.item.info as SharedPartProps["message"]}
                            part={part as SharedPartProps["part"]}
                            useV2Actions
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                  <Show when={row().files.length > 0}>
                    <div class="mb-2 flex max-w-full flex-col gap-1.5">
                      <For each={row().files}>
                        {(part) => (
                          <Part
                            message={props.item.info as SharedPartProps["message"]}
                            part={part as SharedPartProps["part"]}
                            useV2Actions
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                  <Show when={row().textParts.length > 0}>
                    <For each={row().textParts}>
                      {(part) => (
                        <Part
                          message={props.item.info as SharedPartProps["message"]}
                          part={part as SharedPartProps["part"]}
                          showAssistantCopyPartID={null}
                          useV2Actions
                        />
                      )}
                    </For>
                  </Show>
                </Show>
                <Show when={props.showToolsPart && row().tools.length > 0}>
                  <div class="mt-2 flex flex-col gap-1">
                    <For each={row().tools}>
                      {(part) => (
                        <Part
                          message={props.item.info as SharedPartProps["message"]}
                          part={part as SharedPartProps["part"]}
                          useV2Actions
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <div class="mt-1.5 flex min-h-6 items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                <div class="min-w-0 text-xs font-semibold leading-none text-v2-text-text-faint">{role()}</div>
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
            </>
          }
        >
          <SharedMessage
            message={props.item.info as SharedMessageProps["message"]}
            parts={props.item.parts as SharedMessageProps["parts"]}
            actions={props.actions}
            useV2Actions
          />
        </Show>
      </div>
    </article>
  )
}

export function MessageTimeline(props: {
  messages: HistoryItem[]
  actions?: UserActions
  showReasoningSummaries: boolean
  showToolsPart: boolean
  onPointerGesture?: (target?: EventTarget | null) => void
}) {
  const handlePointerDown = (event: PointerEvent) => {
    props.onPointerGesture?.(event.target)
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (event.buttons !== 1) return
    props.onPointerGesture?.(event.target)
  }

  return (
    <div data-slot="session-message-timeline" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}>
      <For each={props.messages}>
        {(item) => (
          <MessageView
            item={item}
            actions={props.actions}
            showReasoningSummaries={props.showReasoningSummaries}
            showToolsPart={props.showToolsPart}
          />
        )}
      </For>
    </div>
  )
}
