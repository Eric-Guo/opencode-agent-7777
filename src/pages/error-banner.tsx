// Inline session notices; 7777 has no routed error page.
import { Icon } from "@opencode-ai/ui/icon"

export function ErrorBanner(props: { error: string }) {
  return (
    <div class="mx-[22px] mb-3 flex min-h-[38px] items-center gap-2.5 rounded-lg border border-[var(--v2-state-border-danger)] bg-[var(--v2-state-bg-danger)] px-2.5 py-2 text-[13px] text-[var(--v2-state-fg-danger)] [&_[data-component=icon]]:shrink-0">
      <Icon name="warning" />
      <span>{props.error}</span>
    </div>
  )
}
