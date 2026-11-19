import { ContextUsage } from "@opencode/gui-plugins/context/context-usage"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Tooltip } from "@opencode/ui/tooltip"
import { createMemo, For, Show } from "solid-js"
import type { ChatController } from "@/nexus/controller"
import { useLanguage } from "@/runtime/i18n/language"
import { SessionContextTab } from "./tab"

export function SessionContextUsage(props: { chat: ChatController }) {
  const language = useLanguage()
  const dialog = useDialog()
  const state = props.chat.s
  const detail = () => state.snapshot.detail
  const usage = () => detail()?.usage
  const context = () => detail()?.context
  const unreported = () => language.t("chat.unknown")
  const cost = () => {
    const summary = usage()
    return summary ? [summary.cost_amount, summary.cost_unit].filter(Boolean).join(" ") : unreported()
  }
  const tokens = createMemo(() => {
    const total = context()?.used_tokens
    // The ring sums token buckets. Nexus supplies the window's total directly.
    if (total != null) return { input: total, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
  })
  const labels = createMemo(() => ({
    cost: language.t(usage()?.cost_complete === false ? "chat.subtotal" : "usage.cost"),
    usage: language.t("usage.usage"),
    tokens: language.t("usage.tokens"),
    view: language.t("usage.view"),
  }))
  const rows = [
    { label: "cost", value: cost },
    {
      label: "usage",
      value: () => {
        const percent = context()?.used_percent
        return percent == null
          ? unreported()
          : new Intl.NumberFormat(language.intl(), { style: "percent", maximumFractionDigits: 0 }).format(percent / 100)
      },
    },
    { label: "tokens", value: () => context()?.used_tokens?.toLocaleString(language.intl()) ?? unreported() },
  ] as const

  function openContext() {
    const id = state.id
    const scope = state.connection?.scope
    const title = detail()?.title
    void dialog.show(() => (
      <Dialog size="x-large" fit>
        <DialogHeader>
          <DialogTitleGroup title={language.t("context.title")} description={title || undefined} />
        </DialogHeader>
        <DialogBody>
          <Show when={state.id === id && state.connection?.scope === scope && state.hydrated}>
            <SessionContextTab chat={props.chat} cost={cost()} />
          </Show>
        </DialogBody>
      </Dialog>
    ))
  }

  return (
    <Show when={state.id && state.hydrated}>
      <Tooltip
        value={
          <div class="flex min-w-36 flex-col gap-2">
            <For each={rows}>
              {(row) => (
                <div class="flex min-w-0 items-center gap-4">
                  <span class="shrink-0 text-v2-text-text-muted">{labels()[row.label]}</span>
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
          aria-label={labels().view}
          aria-haspopup="dialog"
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true })
            openContext()
          }}
        >
          <ContextUsage
            variant="indicator"
            tokens={tokens()}
            contextLimit={context()?.window_tokens ?? undefined}
            labels={labels()}
          />
        </button>
      </Tooltip>
    </Show>
  )
}
