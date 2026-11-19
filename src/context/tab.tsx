import { For, Show } from "solid-js"
import { Activity } from "@/nexus/activity"
import type { ChatController } from "@/nexus/controller"
import { useLanguage } from "@/runtime/i18n/language"

export function SessionContextTab(props: { chat: ChatController; cost: string }) {
  const language = useLanguage()
  const detail = () => props.chat.s.snapshot.detail
  const usage = () => detail()?.usage
  const context = () => detail()?.context
  const number = (value: number | null | undefined) =>
    value?.toLocaleString(language.intl()) ?? language.t("chat.unknown")
  const usageRows = [
    ["chat.requests", "request_count"],
    ["chat.tokens", "total_tokens"],
    ["chat.inputTokens", "input_tokens"],
    ["chat.cacheTokens", "cache_read_tokens"],
    ["chat.outputTokens", "output_tokens"],
    ["chat.reasonTokens", "reasoning_tokens"],
  ] as const

  return (
    <div class="chat-inspect" data-scrollable>
      <h3>{language.t("chat.context")}</h3>
      <dl>
        <dt>{language.t("chat.occupancy")}</dt>
        <dd>
          {number(context()?.used_tokens)} / {number(context()?.window_tokens)}{" "}
          <Show when={context()?.used_percent != null}>{"(" + number(context()?.used_percent) + "%)"}</Show>
        </dd>
        <dt>{language.t("chat.actual")}</dt>
        <dd>{context()?.as_of_model?.model_ref || language.t("chat.unknown")}</dd>
      </dl>
      <h3>{language.t("chat.usageTotal")}</h3>
      <dl>
        <For each={usageRows}>
          {([label, field]) => (
            <>
              <dt>{language.t(label)}</dt>
              <dd>{number(usage()?.[field])}</dd>
            </>
          )}
        </For>
        <dt>{language.t(usage()?.cost_complete === false ? "chat.subtotal" : "chat.cost")}</dt>
        <dd>{props.cost}</dd>
      </dl>
      <Show when={usage()?.cost_complete === false}>
        <p>{language.t("chat.partial")}</p>
      </Show>
      <section
        class="grid min-w-0 gap-2.5 border-t border-border-weak-base pt-4"
        aria-label={language.t("chat.activity")}
      >
        <h3>{language.t("chat.activity")}</h3>
        <Activity chat={props.chat} />
      </section>
    </div>
  )
}
