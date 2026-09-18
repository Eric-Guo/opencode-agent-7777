import { For, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { useLanguage } from "@/runtime/i18n/language"
import type { SessionQueueView } from "./queue"

export function SessionQueuePanel(props: { queue: SessionQueueView }) {
  const language = useLanguage()
  return (
    <Show when={props.queue.rows().length > 0}>
      <div
        data-component="session-queue-panel"
        class="relative z-0 mx-auto -mb-3 max-w-[1120px] rounded-xl bg-v2-background-bg-base px-1.5 pt-1.5 pb-[18px] shadow-[inset_0_0_0_0.5px_var(--v2-border-border-base)]"
      >
        <Show when={props.queue.rows().length > 3}>
          <div class="px-1.5 pt-1 pb-px text-[11px] font-[530] leading-4 text-v2-text-text-muted">
            {language.plural("session.queue.count", props.queue.rows().length)}
          </div>
        </Show>
        <div class="flex max-h-[134px] flex-col gap-px overflow-y-auto">
          <For each={props.queue.rows()}>
            {(row) => (
              <div data-component="session-queue-row" class="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 py-1">
                <span
                  dir="auto"
                  class="min-w-0 flex-1 truncate text-start text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-base"
                >
                  {row.text || (row.attachments ? language.plural("session.queue.attachments", row.attachments) : "")}
                </span>
                <Show when={row.text && row.attachments}>
                  <span class="shrink-0 text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                    {language.plural("session.queue.attachments", row.attachments)}
                  </span>
                </Show>
                <Tooltip
                  placement="top"
                  inactive={!props.queue.working()}
                  value={language.t("session.queue.steerTooltip")}
                >
                  <Button
                    data-action="session-queue-steer"
                    type="button"
                    size="small"
                    variant="ghost-faint"
                    icon="arrow-up"
                    disabled={props.queue.busy()}
                    class="shrink-0 ![font-weight:530]"
                    onClick={() => void props.queue.steer(row.id)}
                  >
                    {props.queue.working() ? language.t("session.queue.steer") : language.t("session.queue.send")}
                  </Button>
                </Tooltip>
                <Tooltip placement="top" value={language.t("session.queue.remove")}>
                  <IconButton
                    data-action="session-queue-remove"
                    type="button"
                    size="small"
                    variant="ghost-muted"
                    icon={<Icon name="outline-xmark" />}
                    disabled={props.queue.busy()}
                    aria-label={language.t("session.queue.remove")}
                    onClick={() => void props.queue.remove(row.id)}
                  />
                </Tooltip>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
