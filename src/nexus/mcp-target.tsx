import { Show } from "solid-js"
import { useLanguage } from "../runtime/i18n/language"
import type { McpTarget } from "./inspection"

export function McpTargetDetails(props: { target: McpTarget }) {
  const lang = useLanguage()
  return (
    <dl class="grid grid-cols-[auto_1fr] gap-x-3">
      <Show when={props.target.connection}>
        {(name) => (
          <>
            <dt>{lang.t("chat.mcpConnection")}</dt>
            <dd>{name()}</dd>
          </>
        )}
      </Show>
      <Show when={props.target.account}>
        {(name) => (
          <>
            <dt>{lang.t("chat.mcpAccount")}</dt>
            <dd>{name()}</dd>
          </>
        )}
      </Show>
      <Show when={props.target.tool}>
        {(name) => (
          <>
            <dt>{lang.t("chat.remoteTool")}</dt>
            <dd>{name()}</dd>
          </>
        )}
      </Show>
    </dl>
  )
}
