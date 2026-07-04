import { Icon } from "@opencode-ai/ui/icon"
import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { PromptAttachment } from "@/context/server-session"

export function PromptImageAttachments(props: {
  attachments: PromptAttachment[]
  disabled: boolean
  onRemove: (id: string) => void
}) {
  const language = useLanguage()

  return (
    <Show when={props.attachments.length > 0}>
      <div class="flex flex-wrap gap-2 border-t border-v2-border-border-base px-[18px] py-2">
        <For each={props.attachments}>
          {(attachment) => (
            <span class="flex h-7 max-w-[220px] items-center gap-1.5 rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-01 pl-2.5 pr-1 text-[12px] font-[560] text-v2-text-text-base">
              <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{attachment.filename}</span>
              <button
                type="button"
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded border-0 bg-transparent text-v2-icon-icon-muted hover:enabled:bg-v2-overlay-simple-overlay-hover hover:enabled:text-v2-icon-icon-base disabled:opacity-60 [&_[data-component=icon]]:h-3 [&_[data-component=icon]]:w-3"
                aria-label={language.t("prompt.removeAttachment", { filename: attachment.filename })}
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
