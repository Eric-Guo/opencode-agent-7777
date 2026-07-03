import { useFilteredList } from "@opencode-ai/ui/hooks"
import { Icon } from "@opencode-ai/ui/icon"
import { Dialog as DialogV2, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/v2/dialog-v2"
import { Switch as SwitchV2 } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { For, Show, type Component } from "solid-js"
import type { ModelSelectorState } from "@/context/models"
import { useLanguage } from "@/context/language"
import { popularProviders } from "@/hooks/use-providers"

type ModelItem = ReturnType<ModelSelectorState["list"]>[number]

export const DialogManageModelsV2: Component<{ model: ModelSelectorState }> = (props) => {
  const language = useLanguage()
  const setProviderVisibility = (providerID: string, checked: boolean) => {
    props.model.setProviderVisibility(providerID, checked)
  }
  const setModelVisibility = (item: ModelItem, checked: boolean) => {
    props.model.setVisibility({ modelID: item.id, providerID: item.provider.id }, checked)
  }
  const list = useFilteredList<ModelItem>({
    items: () => props.model.list(),
    key: (item) => `${item.provider.id}:${item.id}`,
    filterKeys: ["provider.name", "name", "id"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    groupBy: (item) => item.provider.id,
    sortGroupsBy: (a, b) => {
      const aIndex = popularProviders.indexOf(a.category)
      const bIndex = popularProviders.indexOf(b.category)
      const aPopular = aIndex >= 0
      const bPopular = bIndex >= 0

      if (aPopular && !bPopular) return -1
      if (!aPopular && bPopular) return 1
      if (aPopular && bPopular) return aIndex - bIndex

      const aName = a.items[0].provider.name
      const bName = b.items[0].provider.name
      return aName.localeCompare(bName)
    },
  })

  return (
    <DialogV2 size="large" variant="settings" class="max-h-[min(720px,calc(100vh-48px))]">
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("dialog.model.manage")}
          description={language.t("dialog.model.manage.description")}
        />
      </DialogHeader>
      <DialogBody class="flex min-h-0 flex-1 flex-col">
        <div class="px-4 pb-3 pt-px">
          <TextInputV2
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
            showClearButton={!!list.filter()}
            clearLabel={language.t("common.clear")}
            onClearClick={() => list.clear()}
          />
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <Show
            when={!list.grouped.loading}
            fallback={
              <div class="flex h-24 items-center justify-center text-[13px] text-v2-text-text-faint">
                {language.t("common.loading")}
                {language.t("common.loading.ellipsis")}
              </div>
            }
          >
            <Show
              when={list.flat().length > 0}
              fallback={
                <div class="flex h-24 flex-col items-center justify-center text-[13px] text-v2-text-text-faint">
                  <span>{language.t("dialog.model.empty")}</span>
                  <Show when={list.filter()}>
                    <span class="mt-1 text-v2-text-text-base">&quot;{list.filter()}&quot;</span>
                  </Show>
                </div>
              }
            >
              <div class="flex flex-col gap-5">
                <For each={list.grouped.latest}>
                  {(group) => (
                    <section class="flex flex-col gap-2" data-component="settings-models-provider">
                      <div class="flex h-7 items-center justify-between gap-3 px-2">
                        <div class="flex min-w-0 items-center gap-2">
                          <Icon name="models" class="size-4 shrink-0 text-v2-icon-icon-muted" />
                          <h3 class="m-0 truncate text-[13px] font-[560] text-v2-text-text-base">
                            {group.items[0].provider.name}
                          </h3>
                        </div>
                        <SwitchV2
                          checked={group.items.every((item) =>
                            props.model.visible({ modelID: item.id, providerID: item.provider.id }),
                          )}
                          onChange={(checked) => setProviderVisibility(group.category, checked)}
                          hideLabel
                        >
                          {language.t("dialog.model.manage.provider.toggle", {
                            provider: group.items[0].provider.name,
                          })}
                        </SwitchV2>
                      </div>
                      <div class="overflow-hidden rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-01">
                        <For each={group.items}>
                          {(item) => (
                            <div class="flex min-h-10 items-center justify-between gap-4 border-b border-v2-border-border-muted px-3 py-2 last:border-b-0">
                              <span class="min-w-0 truncate text-[13px] font-[440] text-v2-text-text-base">
                                {item.name}
                              </span>
                              <SwitchV2
                                checked={props.model.visible({ modelID: item.id, providerID: item.provider.id })}
                                onChange={(checked) => setModelVisibility(item, checked)}
                                hideLabel
                              >
                                {item.name}
                              </SwitchV2>
                            </div>
                          )}
                        </For>
                      </div>
                    </section>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </DialogBody>
    </DialogV2>
  )
}
