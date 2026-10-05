import { Badge } from "@opencode/ui/badge"
import { Icon } from "@opencode/ui/icon"
import { iconNames, type IconName } from "@opencode/ui/icons/provider"
import { ProviderIcon } from "@opencode/ui/provider-icon"
import { createMemo, For, Match, Show, Switch, type JSX } from "solid-js"
import "@/settings/settings.css"
import { consoleProviderGroup, consoleProviderName } from "@/providers/catalog/console"
import customManagedProvider from "@/providers/custom-managed-provider.svg"
import { OpenCodeLogo } from "@/providers/opencode-logo"
import { useLanguage } from "@/runtime/i18n/language"

type ModelProvider = { id: string; canonical?: string; integrationID?: string; name: string }
type ModelItem = { provider: ModelProvider; cost?: { input: number } }
type ModelGroup<T> = { category: string; items: T[] }

export const CONSOLE_GROUP_KEY = "console:opencode"

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

// Detect the workspace from the full catalog so filtering out its root keeps the group.
export function consoleModelGroup<T extends ModelItem>(items: readonly T[]) {
  return consoleProviderGroup([...new Map(items.map((item) => [item.provider.id, item.provider])).values()])
}

type GroupControls = {
  expanded: boolean
  disabled: boolean
  onExpandedChange: (expanded: boolean) => void
  action?: JSX.Element
}

function ProviderGroupHeader(props: GroupControls & { title: string; icon: JSX.Element; badge?: string }) {
  return (
    <h3 class="settings-models-group-header" classList={{ "justify-between": !!props.action }}>
      <button
        type="button"
        class="settings-models-group-trigger"
        aria-expanded={props.expanded}
        disabled={props.disabled}
        onClick={() => props.onExpandedChange(!props.expanded)}
      >
        <span class="settings-models-group-chevron">
          <Icon name="chevron-down" size="small" classList={{ collapsed: !props.expanded }} />
        </span>
        <span class="settings-models-group-label">
          {props.icon}
          <bdi class="settings-models-group-title">{props.title}</bdi>
          <Show when={props.badge}>{(badge) => <Badge>{badge()}</Badge>}</Show>
        </span>
      </button>
      {props.action}
    </h3>
  )
}

export function ProviderModelGroup(
  props: GroupControls & { provider: ModelProvider; name: string; children: JSX.Element },
) {
  return (
    <section
      class="provider-model-group"
      data-component="provider-model-group"
      data-provider={props.provider.id}
      data-expanded={props.expanded ? "" : undefined}
    >
      <ProviderGroupHeader
        title={props.name}
        icon={<ProviderModelIcon provider={props.provider} class="shrink-0" />}
        expanded={props.expanded}
        disabled={props.disabled}
        onExpandedChange={props.onExpandedChange}
        action={props.action}
      />
      <Show when={props.expanded}>{props.children}</Show>
    </section>
  )
}

export function ProviderModelSections<T extends ModelItem>(props: {
  groups: ModelGroup<T>[]
  managed: ReturnType<typeof consoleModelGroup<T>>
  expanded: (key: string) => boolean
  disabled: boolean
  onExpandedChange: (key: string, expanded: boolean) => void
  rows: (items: T[]) => JSX.Element
  action?: (group: ModelGroup<T>) => JSX.Element
}) {
  const language = useLanguage()
  type Section =
    | { group: ModelGroup<T>; managed?: never }
    | { group?: never; managed: { group: NonNullable<typeof props.managed>; providers: ModelGroup<T>[] } }
  const sections = createMemo<Section[]>(() => {
    const managed = props.managed
    const ids = new Set(managed?.providers.map((provider) => provider.id))
    const nested = props.groups.filter((group) => ids.has(group.category))
    if (!managed || !nested.length) return props.groups.map((group) => ({ group }))
    const first = props.groups.findIndex((group) => ids.has(group.category))
    return props.groups.flatMap<Section>((group, index) => {
      if (!ids.has(group.category)) return [{ group }]
      return index === first ? [{ managed: { group: managed, providers: nested } }] : []
    })
  })
  const name = (group: ModelGroup<T>) =>
    group.category === "opencode" && group.items.every((item) => !item.cost?.input)
      ? language.t("provider.connect.opencode.freeName")
      : group.items[0].provider.name

  return (
    <For each={sections()}>
      {(section) => (
        <Show
          when={section.managed}
          fallback={
            <Show when={section.group}>
              {(group) => (
                <section
                  class="settings-section"
                  data-component="settings-models-provider"
                  data-expanded={props.expanded(group().category) ? "" : undefined}
                >
                  <ProviderGroupHeader
                    title={name(group())}
                    icon={<ProviderModelIcon provider={group().items[0].provider} class="shrink-0" />}
                    expanded={props.expanded(group().category)}
                    disabled={props.disabled}
                    onExpandedChange={(value) => props.onExpandedChange(group().category, value)}
                    action={props.action?.(group())}
                  />
                  <Show when={props.expanded(group().category)}>{props.rows(group().items)}</Show>
                </section>
              )}
            </Show>
          }
        >
          {(managed) => (
            <section
              class="settings-section"
              data-component="settings-models-console"
              data-expanded={props.expanded(CONSOLE_GROUP_KEY) ? "" : undefined}
            >
              <ProviderGroupHeader
                title={language.t("provider.connect.opencode.name")}
                icon={<OpenCodeLogo class="size-4 shrink-0" />}
                badge={managed().group.workspace}
                expanded={props.expanded(CONSOLE_GROUP_KEY)}
                disabled={props.disabled}
                onExpandedChange={(value) => props.onExpandedChange(CONSOLE_GROUP_KEY, value)}
              />
              <Show when={props.expanded(CONSOLE_GROUP_KEY)}>
                <div class="provider-model-groups settings-models-console-groups">
                  <For each={managed().providers}>
                    {(group) => (
                      <ProviderModelGroup
                        provider={group.items[0].provider}
                        name={consoleProviderName(managed().group, group.items[0].provider.name)}
                        expanded={props.expanded(group.category)}
                        disabled={props.disabled}
                        onExpandedChange={(value) => props.onExpandedChange(group.category, value)}
                        action={props.action?.(group)}
                      >
                        {props.rows(group.items)}
                      </ProviderModelGroup>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          )}
        </Show>
      )}
    </For>
  )
}
