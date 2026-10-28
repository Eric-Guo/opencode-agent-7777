import { ContextUsage } from "@opencode/gui-plugins/context/context-usage"
import { createMemo, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { state } from "@/runtime/server/session-store-compact"
import { sessionContextUsage } from "./model"

// The compact header consumes the shared display without mounting an extension host.
export function SessionContextUsage() {
  const language = useLanguage()
  const usage = createMemo(() =>
    sessionContextUsage({ session: state.session, messages: state.sessionMessages, models: state.models }),
  )

  return (
    <Show when={state.session}>
      <ContextUsage
        class="flex h-[30px] w-[30px] items-center justify-center"
        tokens={usage().message?.tokens}
        contextLimit={usage().model?.limit.context}
        cost={state.session?.cost}
        labels={{
          cost: language.t("usage.cost"),
          usage: language.t("usage.usage"),
          tokens: language.t("usage.tokens"),
          view: language.t("usage.view"),
        }}
        variant="indicator"
        placement="bottom"
      />
    </Show>
  )
}
