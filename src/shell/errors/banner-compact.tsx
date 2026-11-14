// Inline session notices; 7777 has no routed error page.
import { Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { useLanguage } from "@/runtime/i18n/language"
import { Icon } from "@opencode/ui/icon"

export function ErrorBanner(props: { error: string; retry?: () => void }) {
  const language = useLanguage()
  return (
    <div class="mx-[22px] mb-3 flex min-h-[38px] items-center gap-2.5 rounded-lg border border-[var(--v2-state-border-danger)] bg-[var(--v2-state-bg-danger)] px-2.5 py-2 text-[13px] text-[var(--v2-state-fg-danger)] [&_[data-component=icon]]:shrink-0">
      <Icon name="warning" />
      <span class="flex-1">{props.error}</span>
      <Show when={props.retry}>
        {(retry) => (
          <Button size="small" variant="ghost" onClick={() => retry()()}>
            {language.t("session.read.retry")}
          </Button>
        )}
      </Show>
    </div>
  )
}
