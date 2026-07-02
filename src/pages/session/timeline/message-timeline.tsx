import type { Part } from "@opencode-ai/sdk"
import { Icon } from "@opencode-ai/ui/icon"
import DOMPurify from "dompurify"
import { marked } from "marked"
import { createMemo, createSignal, For, Show } from "solid-js"
import type { HistoryItem } from "@/pages/session/timeline/rows"

const markdownClass =
  "text-[15px] leading-[1.7] text-[#d8d8d8] [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p]:mb-2.5 [&_p]:mt-0 [&_ul]:mb-2.5 [&_ul]:mt-0 [&_ol]:mb-2.5 [&_ol]:mt-0 [&_pre]:mb-2.5 [&_pre]:mt-0 [&_blockquote]:mb-2.5 [&_blockquote]:mt-0 [&_a]:text-[#22d1bd] [&_a]:underline [&_a]:underline-offset-[3px] [&_code]:rounded [&_code]:bg-[#202124] [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-[#efefef] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#2d2f33] [&_pre]:bg-[#08090a] [&_pre]:p-3 [&_pre]:text-[#f4f2ed] [&_pre_code]:block [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit [&_blockquote]:border-l-[3px] [&_blockquote]:border-l-[#2aa99c] [&_blockquote]:pl-3 [&_blockquote]:text-[#a7aaae] [&_img]:my-3 [&_img]:block [&_img]:h-auto [&_img]:max-w-[min(100%,680px)] [&_img]:rounded-lg [&_img]:border [&_img]:border-[#303236]"

function isTextPart(part: Part): part is Extract<Part, { type: "text" }> {
  return part.type === "text"
}

function isReasoningPart(part: Part): part is Extract<Part, { type: "reasoning" }> {
  return part.type === "reasoning"
}

function isToolPart(part: Part): part is Extract<Part, { type: "tool" }> {
  return part.type === "tool"
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

function toolStatus(part: Extract<Part, { type: "tool" }>) {
  if (part.state.status === "completed") return part.state.title || "Done"
  if (part.state.status === "error") return part.state.error
  if (part.state.status === "running") return part.state.title || "Running"
  return "Pending"
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
  const text = createMemo(() => messageText(props.item.parts))
  const reasoning = createMemo(() => reasoningSummaries(props.item.parts))
  const tools = createMemo(() => props.item.parts.filter(isToolPart))
  const role = createMemo(() => (props.item.info.role === "user" ? "You" : "7777"))
  const copyValue = createMemo(() => text() || reasoning().join("\n\n"))
  const hasContent = createMemo(() => !!text() || reasoning().length > 0)
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
      <div class="hidden h-8 w-8 items-center justify-center rounded-lg bg-[#22312f] text-xs font-[760] leading-none text-white">
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
              ? "min-w-0 rounded-lg border border-[#303236] bg-[#1a1a1c] px-3.5 py-3 shadow-none"
              : "min-w-0 border-0 bg-transparent p-0 shadow-none"
          }
        >
          <Show when={hasContent()} fallback={<div class="text-[#77787b]">...</div>}>
            <Show when={reasoning().length > 0}>
              <div class="mb-3 flex flex-col gap-2">
                <For each={reasoning()}>
                  {(value, index) => (
                    <details class="overflow-hidden rounded-lg border border-[#2d2f33] bg-[#151618]" open>
                      <summary class="min-h-[34px] cursor-default select-none px-2.5 py-2 text-xs font-bold leading-[1.4] text-[#9b9da1]">
                        {reasoning().length > 1 ? `Reasoning summary ${index() + 1}` : "Reasoning summary"}
                      </summary>
                      <div
                        class={`${markdownClass} border-t border-[#2d2f33] p-2.5 text-[13px] leading-[1.55] text-[#b9bbbf]`}
                        innerHTML={renderMarkdown(value)}
                      />
                    </details>
                  )}
                </For>
              </div>
            </Show>
            <Show when={text()}>{(value) => <div class={markdownClass} innerHTML={renderMarkdown(value())} />}</Show>
          </Show>
          <Show when={tools().length > 0}>
            <ul class="mt-3 flex list-none flex-col gap-1.5 p-0">
              <For each={tools()}>
                {(part) => (
                  <li class="flex min-h-7 items-center justify-between gap-3 rounded-[7px] border border-[#303236] bg-[#171819] px-2.5 py-0 text-xs text-[#999ca0]">
                    <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-[650] text-[#cfd0d2]">
                      {part.tool}
                    </span>
                    <span>{toolStatus(part)}</span>
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
          <div class="min-w-0 text-xs font-semibold leading-none text-[#66676a]">{role()}</div>
          <button
            type="button"
            class="inline-flex h-7 min-w-[34px] items-center justify-center gap-[5px] rounded-md border border-transparent bg-[#1f2022] px-2 py-0 text-xs font-[650] text-[#9b9da1] hover:enabled:border-[#3a3b3f] hover:enabled:text-[#e2e2e2] disabled:opacity-45 [&_[data-component=icon]]:h-[15px] [&_[data-component=icon]]:w-[15px]"
            aria-label="Copy message"
            disabled={!copyValue()}
            onClick={handleCopy}
          >
            <Icon name="copy" />
            <span>{copied() ? "Copied" : "Copy message"}</span>
          </button>
        </div>
      </div>
    </article>
  )
}

export function MessageTimeline(props: { messages: HistoryItem[] }) {
  return <For each={props.messages}>{(item) => <MessageView item={item} />}</For>
}
