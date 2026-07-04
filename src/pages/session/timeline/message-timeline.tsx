import { Message as SharedMessage, Part, type UserActions } from "@opencode-ai/session-ui/message-part"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, For, Show, type ComponentProps } from "solid-js"
import { useLanguage, type TranslationKey, type TranslationParams } from "@/context/language"
import type { HistoryItem } from "@/context/server-session"

type SdkPart = import("@opencode-ai/sdk").Part

function isTextPart(part: SdkPart): part is Extract<SdkPart, { type: "text" }> {
  return part.type === "text"
}

function isReasoningPart(part: SdkPart): part is Extract<SdkPart, { type: "reasoning" }> {
  return part.type === "reasoning"
}

function isToolPart(part: SdkPart): part is Extract<SdkPart, { type: "tool" }> {
  return part.type === "tool"
}

function isFilePart(part: SdkPart): part is Extract<SdkPart, { type: "file" }> {
  return part.type === "file"
}

function messageText(parts: SdkPart[]) {
  return parts
    .filter(isTextPart)
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n")
}

function reasoningSummaries(parts: SdkPart[]) {
  return parts
    .filter(isReasoningPart)
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
}

type Translator = (key: TranslationKey, params?: TranslationParams) => string
type SharedMessageProps = ComponentProps<typeof SharedMessage>
type SharedPartProps = ComponentProps<typeof Part>

function toolStatus(part: Extract<SdkPart, { type: "tool" }>, t: Translator) {
  if (part.state.status === "completed") return part.state.title || t("timeline.tool.done")
  if (part.state.status === "error") return part.state.error
  if (part.state.status === "running") return part.state.title || t("timeline.tool.running")
  return t("timeline.tool.pending")
}

function fileLabel(part: Extract<SdkPart, { type: "file" }>) {
  return part.filename || part.url
}

function fileMime(part: Extract<SdkPart, { type: "file" }>) {
  return part.mime || "file"
}

function FileAttachment(props: { part: Extract<SdkPart, { type: "file" }> }) {
  const label = createMemo(() => fileLabel(props.part))
  const mime = createMemo(() => fileMime(props.part))
  const isImage = createMemo(() => mime().startsWith("image/"))

  return (
    <Show
      when={isImage()}
      fallback={
        <a
          class="flex min-h-9 max-w-full items-center gap-2 rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2.5 py-1.5 text-xs font-[650] text-v2-text-text-base no-underline hover:border-v2-border-border-strong hover:text-v2-text-text-base"
          href={props.part.url}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="folder" />
          <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label()}</span>
          <span class="shrink-0 text-v2-text-text-faint">{mime()}</span>
        </a>
      }
    >
      <figure class="m-0 max-w-full">
        <img
          src={props.part.url}
          alt={label()}
          class="block h-auto max-h-[420px] max-w-full rounded-lg border border-v2-border-border-base object-contain"
          loading="lazy"
        />
        <figcaption class="mt-1.5 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs font-[650] text-v2-text-text-faint">
          {label()}
        </figcaption>
      </figure>
    </Show>
  )
}

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

function MessageView(props: { item: HistoryItem; actions?: UserActions }) {
  const language = useLanguage()
  const textParts = createMemo(() => props.item.parts.filter(isTextPart))
  const reasoningParts = createMemo(() => props.item.parts.filter(isReasoningPart))
  const text = createMemo(() => messageText(props.item.parts))
  const reasoning = createMemo(() => reasoningSummaries(props.item.parts))
  const tools = createMemo(() => props.item.parts.filter(isToolPart))
  const files = createMemo(() => props.item.parts.filter(isFilePart))
  const role = createMemo(() => (props.item.info.role === "user" ? language.t("timeline.role.user") : "7777"))
  const copyValue = createMemo(() => text() || reasoning().join("\n\n"))
  const hasContent = createMemo(() => !!text() || reasoning().length > 0 || files().length > 0)
  const [copied, setCopied] = createSignal(false)

  const handleCopy = () => {
    const value = copyValue()
    if (!value) return
    void copyToClipboard(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

  return (
    <article
      class={`group mx-auto mb-[34px] flex max-w-[1120px] max-[720px]:mb-[26px] ${
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
                <Show when={hasContent()} fallback={<div class="text-v2-text-text-faint">...</div>}>
                  <Show when={reasoningParts().length > 0}>
                    <div class="mb-3">
                      <For each={reasoningParts()}>
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
                  <Show when={files().length > 0}>
                    <div class="mb-3 flex max-w-full flex-col gap-2">
                      <For each={files()}>{(part) => <FileAttachment part={part} />}</For>
                    </div>
                  </Show>
                  <Show when={textParts().length > 0}>
                    <For each={textParts()}>
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
                <Show when={tools().length > 0}>
                  <ul class="mt-3 flex list-none flex-col gap-1.5 p-0">
                    <For each={tools()}>
                      {(part) => (
                        <li class="flex min-h-7 items-center justify-between gap-3 rounded-[7px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2.5 py-0 text-xs text-v2-text-text-muted">
                          <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-[650] text-v2-text-text-base">
                            {part.tool}
                          </span>
                          <span>{toolStatus(part, language.t)}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
              <div class="mt-2 flex min-h-7 items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                <div class="min-w-0 text-xs font-semibold leading-none text-v2-text-text-faint">{role()}</div>
                <button
                  type="button"
                  class="inline-flex h-7 min-w-[34px] items-center justify-center gap-[5px] rounded-md border border-transparent bg-v2-background-bg-layer-01 px-2 py-0 text-xs font-[650] text-v2-text-text-muted hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover hover:enabled:text-v2-text-text-base disabled:opacity-45 [&_[data-component=icon]]:h-[15px] [&_[data-component=icon]]:w-[15px]"
                  aria-label={language.t("timeline.copy")}
                  disabled={!copyValue()}
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

export function MessageTimeline(props: { messages: HistoryItem[]; actions?: UserActions }) {
  return <For each={props.messages}>{(item) => <MessageView item={item} actions={props.actions} />}</For>
}
