import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, For, Show } from "solid-js"
import {
  isToolPart,
  messageText,
  reasoningSummaries,
  renderMarkdown,
  toolStatus,
  type HistoryItem,
} from "@/pages/session/helpers"

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
    <article class={`message message-${props.item.info.role}`}>
      <div class="message-avatar">{props.item.info.role === "user" ? "U" : "7"}</div>
      <div class="message-body">
        <Show when={hasContent()} fallback={<div class="message-empty">...</div>}>
          <Show when={reasoning().length > 0}>
            <div class="reasoning-list">
              <For each={reasoning()}>
                {(value, index) => (
                  <details class="reasoning-summary" open>
                    <summary>
                      {reasoning().length > 1 ? `Reasoning summary ${index() + 1}` : "Reasoning summary"}
                    </summary>
                    <div class="markdown" innerHTML={renderMarkdown(value)} />
                  </details>
                )}
              </For>
            </div>
          </Show>
          <Show when={text()}>{(value) => <div class="markdown" innerHTML={renderMarkdown(value())} />}</Show>
        </Show>
        <Show when={tools().length > 0}>
          <ul class="tool-list">
            <For each={tools()}>
              {(part) => (
                <li>
                  <span>{part.tool}</span>
                  <span>{toolStatus(part)}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <div class="message-actions">
          <div class="message-meta">{role()}</div>
          <button
            type="button"
            class="message-copy"
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
