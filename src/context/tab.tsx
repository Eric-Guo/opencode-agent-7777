import type { SessionInfo } from "@opencode/client/promise"
import { createMemo, For, Show } from "solid-js"
import { useLanguage, type TranslationKey } from "@/runtime/i18n/language"
import type { SessionRuntime } from "@/runtime/server/runtime"
import { state } from "@/runtime/server/session-store-compact"
import { sessionContextUsage } from "./model"

// The public GUI plugin exposes the indicator; its full tab requires a plugin host.
export default function SessionContextTab(props: { runtime: SessionRuntime }) {
  const language = useLanguage()
  const session = () => props.runtime.view().session
  const usage = createMemo(() =>
    sessionContextUsage({
      session: session(),
      messages: props.runtime.view().sessionMessages,
      models: state.models,
    }),
  )
  const number = (value: number | undefined) => value?.toLocaleString(language.intl()) ?? "—"
  const cost = createMemo(() =>
    new Intl.NumberFormat(language.intl(), { style: "currency", currency: "USD" }).format(session().cost),
  )
  const rows = [
    { label: "context.input", read: (tokens) => tokens.input },
    { label: "context.output", read: (tokens) => tokens.output },
    { label: "context.reasoning", read: (tokens) => tokens.reasoning },
    { label: "context.cacheRead", read: (tokens) => tokens.cache.read },
    { label: "context.cacheWrite", read: (tokens) => tokens.cache.write },
  ] satisfies { label: TranslationKey; read: (tokens: SessionInfo["tokens"]) => number }[]

  return (
    <div class="min-h-0 flex-1 overflow-y-auto p-4 text-13-regular" data-scrollable>
      <p class="mb-4 text-text-weak">{language.t("context.description")}</p>
      <dl class="mb-5 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt class="text-12-regular text-text-weak">{language.t("context.provider")}</dt>
          <dd class="break-words">{usage().model?.providerName ?? usage().message?.model.providerID ?? "—"}</dd>
        </div>
        <div>
          <dt class="text-12-regular text-text-weak">{language.t("context.model")}</dt>
          <dd class="break-words">{usage().model?.name ?? usage().message?.model.id ?? "—"}</dd>
        </div>
        <div>
          <dt class="text-12-regular text-text-weak">{language.t("context.limit")}</dt>
          <dd>{number(usage().model?.limit.context)}</dd>
        </div>
        <div>
          <dt class="text-12-regular text-text-weak">{language.t("usage.usage")}</dt>
          <dd>{usage().usage === undefined ? "—" : `${number(usage().usage)}%`}</dd>
        </div>
      </dl>
      <Show when={!usage().message}>
        <p class="mb-3 text-text-weak" role="status">
          {language.t("context.unavailable")}
        </p>
      </Show>
      <table class="w-full border-collapse text-left tabular-nums">
        <caption class="sr-only">{language.t("context.tokens")}</caption>
        <thead>
          <tr class="border-b border-border-weak-base text-12-regular text-text-weak">
            <th scope="col" class="py-2 font-medium">
              {language.t("usage.tokens")}
            </th>
            <th scope="col" class="px-2 py-2 text-right font-medium">
              {language.t("context.latest")}
            </th>
            <th scope="col" class="py-2 text-right font-medium">
              {language.t("context.sessionTotal")}
            </th>
          </tr>
        </thead>
        <tbody>
          <For each={rows}>
            {(row) => (
              <tr class="border-b border-border-weak-base">
                <th scope="row" class="py-2 font-normal">
                  {language.t(row.label)}
                </th>
                <td class="px-2 py-2 text-right">
                  {number(usage().message ? row.read(usage().message!.tokens) : undefined)}
                </td>
                <td class="py-2 text-right">{number(row.read(session().tokens))}</td>
              </tr>
            )}
          </For>
          <tr>
            <th scope="row" class="py-2 font-medium">
              {language.t("context.total")}
            </th>
            <td class="px-2 py-2 text-right font-medium">{number(usage().total)}</td>
            <td class="py-2 text-right font-medium">{number(usage().sessionTotal)}</td>
          </tr>
        </tbody>
      </table>
      <dl class="mt-4 flex items-center justify-between gap-4 border-t border-border-weak-base pt-4">
        <dt class="text-text-weak">{language.t("context.cost")}</dt>
        <dd class="tabular-nums">{cost()}</dd>
      </dl>
    </div>
  )
}
