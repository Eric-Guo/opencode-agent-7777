import { createMemo, For, Show } from "solid-js"
import {
  isToolPart,
  messageText,
  renderMarkdown,
  toolStatus,
  type HistoryItem,
} from "@/pages/session/helpers"

function MessageView(props: { item: HistoryItem }) {
  const text = createMemo(() => messageText(props.item.parts))
  const tools = createMemo(() => props.item.parts.filter(isToolPart))
  const role = createMemo(() => (props.item.info.role === "user" ? "You" : "7777"))

  return (
    <article class={`message message-${props.item.info.role}`}>
      <div class="message-avatar">{props.item.info.role === "user" ? "U" : "7"}</div>
      <div class="message-body">
        <div class="message-meta">{role()}</div>
        <Show when={text()} fallback={<div class="message-empty">...</div>}>
          {(value) => <div class="markdown" innerHTML={renderMarkdown(value())} />}
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
      </div>
    </article>
  )
}

export function MessageTimeline(props: { messages: HistoryItem[] }) {
  return <For each={props.messages}>{(item) => <MessageView item={item} />}</For>
}
