import { ContextUsage } from "@opencode/gui-extensions/usage/context-usage"
import { createMemo, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { state } from "@/runtime/server/session-store-compact"

// The compact header consumes the shared display without mounting an extension host.
export function SessionContextUsage() {
  const language = useLanguage()
  const message = createMemo(() => {
    const last = state.sessionMessages.findLast((item) => item.type === "assistant" && !!item.tokens)
    return last?.type === "assistant" ? last : undefined
  })
  const model = createMemo(() => {
    const last = message()
    return last && state.models.find((item) => item.providerID === last.model.providerID && item.id === last.model.id)
  })

  return (
    <Show when={state.session}>
      <ContextUsage
        class="flex h-[30px] w-[30px] items-center justify-center"
        tokens={message()?.tokens}
        contextLimit={model()?.limit.context}
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
