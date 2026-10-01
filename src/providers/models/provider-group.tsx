import { Icon } from "@opencode/ui/icon"
import { iconNames, type IconName } from "@opencode/ui/icons/provider"
import { ProviderIcon } from "@opencode/ui/provider-icon"
import { For, Match, Show, Switch, type JSX } from "solid-js"
import "@/settings/settings.css"
import customManagedProvider from "@/providers/custom-managed-provider.svg"
import { OpenCodeLogo } from "@/providers/opencode-logo"
import { useLanguage } from "@/runtime/i18n/language"

type ModelProvider = { id: string; canonical?: string; name: string }
type ModelItem = { provider: ModelProvider; cost?: { input: number } }
type ModelGroup<T> = { category: string; items: T[] }

export function CustomManagedProviderIcon(props: { class?: string }) {
  return <img data-component="custom-managed-provider-icon" src={customManagedProvider} alt="" class={props.class} />
}

export function ProviderModelIcon(props: { provider: ModelProvider; class?: string }) {
  const icon = () =>
    [
      props.provider.canonical,
      props.provider.canonical?.replace(/-token-plan$/, ""),
      props.provider.id.replace(/^console-/, ""),
    ].find((id): id is IconName => !!id && id !== "synthetic" && iconNames.includes(id as IconName))

  return (
    <Switch>
      <Match when={props.provider.id === "opencode"}>
        <OpenCodeLogo class={`size-4 ${props.class ?? ""}`} />
      </Match>
      <Match when={icon()} keyed>
        {(id) => <ProviderIcon id={id} width={16} height={16} class={props.class} />}
      </Match>
      <Match when={true}>
        <CustomManagedProviderIcon class={`size-4 ${props.class ?? ""}`} />
      </Match>
    </Switch>
  )
}

// The compact catalog has direct providers only; it does not expose Console workspace integrations.
export function ProviderModelSections<T extends ModelItem>(props: {
  groups: ModelGroup<T>[]
  expanded: (key: string) => boolean
  disabled: boolean
  onExpandedChange: (key: string, expanded: boolean) => void
  rows: (items: T[]) => JSX.Element
  action?: (group: ModelGroup<T>) => JSX.Element
}) {
  const language = useLanguage()
  const name = (group: ModelGroup<T>) =>
    group.category === "opencode" && group.items.every((item) => !item.cost?.input)
      ? language.t("provider.connect.opencode.freeName")
      : group.items[0].provider.name

  return (
    <For each={props.groups}>
      {(group) => (
        <section
          class="settings-section"
          data-component="settings-models-provider"
          data-expanded={props.expanded(group.category) ? "" : undefined}
        >
          <h3 class="settings-models-group-header" classList={{ "justify-between": !!props.action }}>
            <button
              type="button"
              class="settings-models-group-trigger"
              aria-expanded={props.expanded(group.category)}
              disabled={props.disabled}
              onClick={() => props.onExpandedChange(group.category, !props.expanded(group.category))}
            >
              <span class="settings-models-group-chevron">
                <Icon name="chevron-down" size="small" classList={{ collapsed: !props.expanded(group.category) }} />
              </span>
              <span class="settings-models-group-label">
                <ProviderModelIcon provider={group.items[0].provider} class="shrink-0" />
                <bdi class="settings-models-group-title">{name(group)}</bdi>
              </span>
            </button>
            {props.action?.(group)}
          </h3>
          <Show when={props.expanded(group.category)}>{props.rows(group.items)}</Show>
        </section>
      )}
    </For>
  )
}
