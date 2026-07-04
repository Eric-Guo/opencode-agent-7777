import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"

export function PromptDragOverlay(props: {
  active: boolean
  label: string
}) {
  return (
    <Show when={props.active}>
      <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-v2-background-bg-base/90">
        <div class="flex flex-col items-center gap-2 text-v2-text-text-muted">
          <Icon name="photo" class="size-8" />
          <span class="text-[13px] font-[520]">{props.label}</span>
        </div>
      </div>
    </Show>
  )
}
