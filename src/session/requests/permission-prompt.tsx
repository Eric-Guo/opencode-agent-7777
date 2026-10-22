import { For, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { Icon } from "@opencode/ui/icon"
import { useI18n } from "@opencode/ui/context/i18n"

export type PermissionPromptProps = {
  title: string
  description?: string
  resources: readonly string[]
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
}

export function PermissionPrompt(props: PermissionPromptProps) {
  const i18n = useI18n()

  return (
    <DockPrompt
      kind="permission"
      header={
        <div data-slot="permission-row" data-variant="header">
          <span data-slot="permission-icon">
            <Icon name="warning" size="normal" />
          </span>
          <div data-slot="permission-header-title">{props.title}</div>
        </div>
      }
      footer={
        <>
          <div />
          <div data-slot="permission-footer-actions">
            <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
              {i18n.t("ui.permission.deny")}
            </Button>
            <Button
              variant="neutral"
              size="normal"
              onClick={() => props.onDecide("always")}
              disabled={props.responding}
            >
              {i18n.t("ui.permission.allowAlways")}
            </Button>
            <Button variant="contrast" size="normal" onClick={() => props.onDecide("once")} disabled={props.responding}>
              {i18n.t("ui.permission.allowOnce")}
            </Button>
          </div>
        </>
      }
    >
      <Show when={props.description}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">{props.description}</div>
        </div>
      </Show>

      <Show when={props.resources.length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-patterns">
            <For each={props.resources}>
              {(pattern) => <code class="text-12-regular text-text-base break-all">{pattern}</code>}
            </For>
          </div>
        </div>
      </Show>
    </DockPrompt>
  )
}
