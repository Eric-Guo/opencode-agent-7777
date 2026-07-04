import type { Part } from "@opencode-ai/sdk"
import { Icon } from "@opencode-ai/ui/icon"
import DOMPurify from "dompurify"
import { marked } from "marked"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useLanguage, type TranslationKey, type TranslationParams } from "@/context/language"
import type { HistoryItem } from "@/context/server-session"

const markdownClass =
  "text-[15px] leading-[1.7] text-v2-text-text-base [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p]:mb-2.5 [&_p]:mt-0 [&_ul]:mb-2.5 [&_ul]:mt-0 [&_ol]:mb-2.5 [&_ol]:mt-0 [&_pre]:mb-2.5 [&_pre]:mt-0 [&_blockquote]:mb-2.5 [&_blockquote]:mt-0 [&_a]:text-v2-text-text-accent [&_a]:underline [&_a]:underline-offset-[3px] [&_code]:rounded [&_code]:bg-v2-background-bg-layer-02 [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-v2-text-text-base [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-v2-border-border-base [&_pre]:bg-v2-background-bg-deep [&_pre]:p-3 [&_pre]:text-v2-text-text-base [&_pre_code]:block [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit [&_blockquote]:border-l-[3px] [&_blockquote]:border-l-v2-border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-v2-text-text-muted [&_img]:my-3 [&_img]:block [&_img]:h-auto [&_img]:max-w-[min(100%,680px)] [&_img]:rounded-lg [&_img]:border [&_img]:border-v2-border-border-base"

function isTextPart(part: Part): part is Extract<Part, { type: "text" }> {
  return part.type === "text"
}

function isReasoningPart(part: Part): part is Extract<Part, { type: "reasoning" }> {
  return part.type === "reasoning"
}

function isToolPart(part: Part): part is Extract<Part, { type: "tool" }> {
  return part.type === "tool"
}

function isFilePart(part: Part): part is Extract<Part, { type: "file" }> {
  return part.type === "file"
}

function messageText(parts: Part[]) {
  return parts
    .filter(isTextPart)
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n")
}

function reasoningSummaries(parts: Part[]) {
  return parts
    .filter(isReasoningPart)
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
}

function renderMarkdown(value: string) {
  const parsed = marked.parse(value, { async: false })
  return DOMPurify.sanitize(typeof parsed === "string" ? parsed : value)
}

type Translator = (key: TranslationKey, params?: TranslationParams) => string

function toolStatus(part: Extract<Part, { type: "tool" }>, t: Translator) {
  if (part.state.status === "completed") return part.state.title || t("timeline.tool.done")
  if (part.state.status === "error") return part.state.error
  if (part.state.status === "running") return part.state.title || t("timeline.tool.running")
  return t("timeline.tool.pending")
}

function fileLabel(part: Extract<Part, { type: "file" }>) {
  return part.filename || part.url
}

function fileMime(part: Extract<Part, { type: "file" }>) {
  return part.mime || "file"
}

function FileAttachment(props: { part: Extract<Part, { type: "file" }> }) {
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

function MessageView(props: { item: HistoryItem }) {
  const language = useLanguage()
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
        <div
          class={
            props.item.info.role === "user"
              ? "min-w-0 rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3.5 py-3 shadow-none"
              : "min-w-0 border-0 bg-transparent p-0 shadow-none"
          }
        >
          <Show when={hasContent()} fallback={<div class="text-v2-text-text-faint">...</div>}>
            <Show when={reasoning().length > 0}>
              <div class="mb-3 flex flex-col gap-2">
                <For each={reasoning()}>
                  {(value, index) => (
                    <details class="overflow-hidden rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01" open>
                      <summary class="min-h-[34px] cursor-default select-none px-2.5 py-2 text-xs font-bold leading-[1.4] text-v2-text-text-muted">
                        {reasoning().length > 1
                          ? language.t("timeline.reasoningSummaryIndexed", { index: index() + 1 })
                          : language.t("timeline.reasoningSummary")}
                      </summary>
                      <div
                        class={`${markdownClass} border-t border-v2-border-border-base p-2.5 text-[13px] leading-[1.55] text-v2-text-text-muted`}
                        innerHTML={renderMarkdown(value)}
                      />
                    </details>
                  )}
                </For>
              </div>
            </Show>
            <Show when={files().length > 0}>
              <div class="mb-3 flex max-w-full flex-col gap-2">
                <For each={files()}>{(part) => <FileAttachment part={part} />}</For>
              </div>
            </Show>
            <Show when={text()}>{(value) => <div class={markdownClass} innerHTML={renderMarkdown(value())} />}</Show>
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
        <div
          class={`mt-2 flex min-h-7 items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
            props.item.info.role === "user" ? "justify-end" : ""
          }`}
        >
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
      </div>
    </article>
  )
}

export function MessageTimeline(props: { messages: HistoryItem[] }) {
  return <For each={props.messages}>{(item) => <MessageView item={item} />}</For>
}
