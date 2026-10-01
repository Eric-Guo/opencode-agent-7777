import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Switch } from "@opencode/ui/switch"
import { TextInput } from "@opencode/ui/text-input"
import { useFilteredList } from "@opencode/ui/hooks"
import { For, Show, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import "@/settings/settings.css"
import type { ModelSelectorState } from "@/providers/models/selection"
import { popularProviders } from "@/providers/catalog/providers"
import { useLanguage } from "@/runtime/i18n/language"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import { ProviderModelSections } from "@/providers/models/provider-group"

type ModelItem = ReturnType<ModelSelectorState["list"]>[number]

export const DialogManageModels: Component<{ model: ModelSelectorState }> = (props) => {
  const language = useLanguage()
  const [store, setStore] = createStore({ collapsed: {} as Record<string, boolean> })

  const providerList = (providerID: string) => props.model.list().filter((x) => x.provider.id === providerID)
  const providerVisible = (providerID: string) =>
    providerList(providerID).every((x) => props.model.visible({ modelID: x.id, providerID: x.provider.id }))
  const setProviderVisibility = (providerID: string, checked: boolean) => {
    props.model.setProviderVisibility(providerID, checked)
  }
  const setModelVisibility = (item: ModelItem, checked: boolean) => {
    props.model.setVisibility({ modelID: item.id, providerID: item.provider.id }, checked)
  }
  const list = useFilteredList<ModelItem>({
    items: () => props.model.list(),
    key: (x) => `${x.provider.id}:${x.id}`,
    filterKeys: ["provider.name", "name", "id"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    groupBy: (x) => x.provider.id,
    sortGroupsBy: (a, b) => {
      const aRank = popularProviders.indexOf(a.category)
      const bRank = popularProviders.indexOf(b.category)
      const aPopular = aRank >= 0
      const bPopular = bRank >= 0
      if (aPopular && !bPopular) return -1
      if (!aPopular && bPopular) return 1
      if (aPopular && bPopular) return aRank - bRank
      return a.items[0].provider.name.localeCompare(b.items[0].provider.name)
    },
  })
  const searching = () => list.filter().length > 0
  const expanded = (key: string) => searching() || !store.collapsed[key]

  function ModelRows(input: { items: ModelItem[] }) {
    return (
      <SettingsList variant="catalog">
        <For each={input.items}>
          {(item) => (
            <SettingsRow title={item.name} description="">
              <div>
                <Switch
                  checked={props.model.visible({ modelID: item.id, providerID: item.provider.id })}
                  onChange={(checked) => setModelVisibility(item, checked)}
                  hideLabel
                >
                  {item.name}
                </Switch>
              </div>
            </SettingsRow>
          )}
        </For>
      </SettingsList>
    )
  }

  return (
    <Dialog
      size="large"
      variant="settings"
      class="oc-agent-models-dialog settings-manage-models-dialog"
      containerClass="max-w-[calc(100vw-32px)] max-h-[calc(100dvh-48px)]"
    >
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("dialog.model.manage")}
          description={language.t("dialog.model.manage.description")}
        />
      </DialogHeader>
      <DialogBody class="flex min-h-0 flex-1 flex-col">
        <div class="px-4 pt-px pb-3">
          <div class="relative">
            <TextInput
              type="search"
              appearance="base"
              class="!w-full self-stretch"
              value={list.filter()}
              onInput={(event) => list.onInput(event.currentTarget.value)}
              placeholder={language.t("dialog.model.search.placeholder")}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              autofocus
              aria-label={language.t("dialog.model.search.placeholder")}
            />
            <Show when={list.filter()}>
              <IconButton
                type="button"
                variant="ghost-muted"
                size="small"
                class="settings-tab-search-clear"
                icon={<Icon name="close" size="large" class="text-v2-icon-icon-muted" />}
                onClick={() => list.clear()}
                aria-label={language.t("common.clear")}
              />
            </Show>
          </div>
        </div>
        <div data-slot="manage-models-scroll" class="relative min-h-0 flex-1">
          <div class="settings-panel settings-models h-full px-4 pt-1 pb-4">
            <Show
              when={!list.grouped.loading}
              fallback={
                <div class="settings-models-status">
                  {language.t("common.loading")}
                  {language.t("common.loading.ellipsis")}
                </div>
              }
            >
              <Show
                when={list.flat().length > 0}
                fallback={
                  <div class="settings-models-status">
                    <span>{language.t("dialog.model.empty")}</span>
                    <Show when={list.filter()}>
                      <span class="settings-models-status-filter">&quot;{list.filter()}&quot;</span>
                    </Show>
                  </div>
                }
              >
                <ProviderModelSections
                  groups={list.grouped.latest}
                  expanded={expanded}
                  disabled={searching()}
                  onExpandedChange={(key, value) => setStore("collapsed", key, !value)}
                  action={(group) => (
                    <Switch
                      class="me-6"
                      checked={providerVisible(group.category)}
                      onChange={(checked) => setProviderVisibility(group.category, checked)}
                      hideLabel
                    >
                      {language.t("dialog.model.manage.provider.toggle", { provider: group.items[0].provider.name })}
                    </Switch>
                  )}
                  rows={(items) => <ModelRows items={items} />}
                />
              </Show>
            </Show>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  )
}
