import { ProgressCircle } from "@opencode/ui/progress-circle"
import { Tooltip } from "@opencode/ui/tooltip"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { state } from "@/runtime/server/session-store-compact"
import { sessionContextUsage } from "./model"
import { useContextDialog } from "./dialog-compact"

// The plugin's indicator is display-only. Compose public controls locally for an accessible ring button.
export function SessionContextUsage() {
  const language = useLanguage()
  const openContext = useContextDialog()
  const usage = createMemo(() =>
    sessionContextUsage({ session: state.session, messages: state.sessionMessages, models: state.models }),
  )
  const cost = createMemo(() =>
    new Intl.NumberFormat(language.intl(), { style: "currency", currency: "USD" }).format(state.session?.cost ?? 0),
  )
  const rows = [
    { label: "usage.cost", value: cost },
    { label: "usage.usage", value: () => `${usage().usage ?? 0}%` },
    { label: "usage.tokens", value: () => (usage().total ?? 0).toLocaleString(language.intl()) },
  ] as const

  return (
    <Show when={state.session}>
      <Tooltip
        value={
          <div class="flex w-[120px] flex-col gap-2">
            <For each={rows}>
              {(row) => (
                <div class="flex min-w-0 items-center gap-4">
                  <span class="shrink-0 text-v2-text-text-muted">{language.t(row.label)}</span>
                  <span class="ml-auto min-w-0 truncate text-right text-v2-text-text-base">{row.value()}</span>
                </div>
              )}
            </For>
          </div>
        }
        placement="bottom"
      >
        <button
          type="button"
          class="flex h-[30px] w-[30px] items-center justify-center rounded-full hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={language.t("usage.view")}
          aria-haspopup="dialog"
          onClick={(event) => {
            // Capture the ring as the return target for pointer and keyboard activation.
            event.currentTarget.focus({ preventScroll: true })
            openContext()
          }}
        >
          <ProgressCircle
            appearance="indicator"
            size={16}
            strokeWidth={2}
            percentage={usage().usage ?? 0}
            style={{
              "--progress-circle-background": "var(--v2-background-bg-layer-04)",
              "--progress-circle-background-overlay": "var(--v2-overlay-simple-overlay-pressed, transparent)",
              "--progress-circle-progress": "var(--v2-icon-icon-base, var(--icon-base))",
            }}
          />
        </button>
      </Tooltip>
    </Show>
  )
}
