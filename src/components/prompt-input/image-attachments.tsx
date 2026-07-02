import { Icon } from "@opencode-ai/ui/icon"
import { For, Show } from "solid-js"
import type { PromptAttachment } from "@/context/sync"

export function PromptImageAttachments(props: {
  attachments: PromptAttachment[]
  disabled: boolean
  onRemove: (id: string) => void
}) {
  return (
    <Show when={props.attachments.length > 0}>
      <div class="flex flex-wrap gap-2 border-t border-[#232426] px-[18px] py-2">
        <For each={props.attachments}>
          {(attachment) => (
            <span class="flex h-7 max-w-[220px] items-center gap-1.5 rounded-md border border-[#303236] bg-[#191a1d] pl-2.5 pr-1 text-[12px] font-[560] text-[#c5c7cb]">
              <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{attachment.filename}</span>
              <button
                type="button"
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded border-0 bg-transparent text-[#85878c] hover:enabled:bg-[#25272b] hover:enabled:text-[#e1e2e4] disabled:opacity-60 [&_[data-component=icon]]:h-3 [&_[data-component=icon]]:w-3"
                aria-label={`Remove ${attachment.filename}`}
                disabled={props.disabled}
                onClick={() => props.onRemove(attachment.id)}
              >
                <Icon name="close" />
              </button>
            </span>
          )}
        </For>
      </div>
    </Show>
  )
}
