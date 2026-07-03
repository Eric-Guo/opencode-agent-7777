import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Tag as TagV2 } from "@opencode-ai/ui/v2/badge-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import {
  type ComponentProps,
  createEffect,
  createMemo,
  For,
  type JSX,
  onCleanup,
  Show,
  type ValidComponent,
} from "solid-js"
import { createStore } from "solid-js/store"
import { DEFAULT_MODEL_CONFIG } from "@/context/default-model-config"
import type { ModelSelectorState } from "@/context/models"
import { useLanguage } from "@/context/language"
import { popularProviders } from "@/hooks/use-providers"
import { handleDocumentSearchKeydown } from "@/utils/search-keydown"
import { matchesModelSearch } from "./dialog-select-model-search"

const isFree = (provider: string, cost: { input: number } | undefined) =>
  provider === "opencode" && (!cost || cost.input === 0)

type ModelItem = ReturnType<ModelSelectorState["list"]>[number]
type ModelSelectorTriggerProps = Omit<ComponentProps<typeof MenuV2.Trigger>, "as" | "ref">

const modelKey = (model: ModelItem) => `${model.provider.id}:${model.id}`
const manageKey = "action:manage"

const sortModelGroups = (a: { category: string; items: ModelItem[] }, b: { category: string; items: ModelItem[] }) => {
  const aIndex = popularProviders.indexOf(a.category)
  const bIndex = popularProviders.indexOf(b.category)
  const aPopular = aIndex >= 0
  const bPopular = bIndex >= 0

  if (aPopular && !bPopular) return -1
  if (!aPopular && bPopular) return 1
  if (aPopular && bPopular) return aIndex - bIndex
  return a.items[0].provider.name.localeCompare(b.items[0].provider.name)
}

export function ModelSelectorPopoverV2(props: {
  provider?: string
  model: ModelSelectorState
  children?: JSX.Element
  triggerAs?: ValidComponent
  triggerProps?: ModelSelectorTriggerProps
  onClose?: () => void
  onManage?: () => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore({ open: false, search: "", active: "" })
  let searchRef: HTMLInputElement | undefined
  let contentRef: HTMLDivElement | undefined
  let restoreTrigger = true
  const canManage = () => DEFAULT_MODEL_CONFIG.manageModels && !!props.onManage

  const allModels = createMemo(() =>
    props.model
      .list()
      .filter((item) => props.model.visible({ modelID: item.id, providerID: item.provider.id }))
      .filter((item) => (props.provider ? item.provider.id === props.provider : true)),
  )
  const models = createMemo(() => {
    const search = store.search.trim()
    const filtered = search
      ? allModels().filter((item) => matchesModelSearch(search, [item.name, item.id, item.provider.name]))
      : allModels()

    return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  })
  const groups = createMemo(() => {
    const byProvider = new Map<string, ModelItem[]>()
    for (const item of models()) {
      byProvider.set(item.provider.id, [...(byProvider.get(item.provider.id) ?? []), item])
    }
    return Array.from(byProvider, ([category, items]) => ({ category, items })).sort(sortModelGroups)
  })
  const keys = () => (canManage() ? [...models().map(modelKey), manageKey] : models().map(modelKey))
  const current = () => {
    const value = props.model.current()
    return value ? `${value.provider.id}:${value.id}` : undefined
  }
  const initialActive = () => {
    const selected = current()
    const options = keys()
    if (selected && options.includes(selected)) return selected
    return options[0] ?? ""
  }
  const activeItem = () =>
    store.active ? contentRef?.querySelector<HTMLElement>(`[data-option-key="${CSS.escape(store.active)}"]`) : undefined
  const afterClose = (callback: () => void) => {
    const complete = () => {
      if (contentRef?.isConnected) {
        requestAnimationFrame(complete)
        return
      }
      requestAnimationFrame(() => requestAnimationFrame(callback))
    }
    requestAnimationFrame(complete)
  }
  const setOpen = (open: boolean) => {
    if (open) {
      restoreTrigger = true
      setStore({ open: true, active: initialActive() })
      setTimeout(() =>
        requestAnimationFrame(() => {
          searchRef?.focus()
          activeItem()?.scrollIntoView({ block: "nearest" })
        }),
      )
      return
    }
    setStore({ open: false, search: "", active: "" })
  }
  const select = (item: ModelItem) => {
    props.model.set({ modelID: item.id, providerID: item.provider.id }, { recent: true })
    props.onClose?.()
  }
  const selectModel = (item: ModelItem) => {
    restoreTrigger = false
    setOpen(false)
    afterClose(() => select(item))
  }
  const manage = () => {
    restoreTrigger = false
    setOpen(false)
    afterClose(() => {
      props.onManage?.()
      props.onClose?.()
    })
  }
  const selectActive = () => {
    const item = models().find((item) => modelKey(item) === store.active)
    if (item) {
      selectModel(item)
      return
    }
    if (canManage() && store.active === manageKey) manage()
  }
  const moveActive = (delta: number) => {
    const options = keys()
    if (options.length === 0) return
    const index = options.indexOf(store.active)
    const start = index === -1 ? 0 : index
    setStore("active", options[(start + delta + options.length) % options.length])
    queueMicrotask(() => activeItem()?.scrollIntoView({ block: "nearest" }))
  }
  const setSearch = (value: string) => {
    const search = value.trim()
    const first = [...allModels()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .find((item) => matchesModelSearch(search, [item.name, item.id, item.provider.name]))
    setStore({ search: value, active: first ? modelKey(first) : canManage() ? manageKey : "" })
  }

  createEffect(() => {
    if (!store.open) return
    const listener = (event: KeyboardEvent) => handleDocumentSearchKeydown(searchRef, event, store.search, setSearch)
    document.addEventListener("keydown", listener, true)
    onCleanup(() => document.removeEventListener("keydown", listener, true))
  })

  return (
    <MenuV2 open={store.open} modal={false} placement="top-start" gutter={6} onOpenChange={setOpen}>
      <MenuV2.Trigger as={props.triggerAs ?? "div"} {...props.triggerProps}>
        {props.children}
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content
          ref={(el: HTMLDivElement) => (contentRef = el)}
          class="w-[284px] overflow-hidden rounded-md border-0 bg-v2-background-bg-layer-01 !p-0 shadow-[var(--v2-elevation-floating)] focus:outline-none"
          onPointerDownOutside={() => (restoreTrigger = false)}
          onFocusOutside={() => (restoreTrigger = false)}
          onCloseAutoFocus={(event) => {
            if (!restoreTrigger) event.preventDefault()
          }}
        >
          <div class="flex flex-col p-0.5">
            <div class="flex h-7 items-center gap-2 rounded-sm pl-3 pr-2.5 text-v2-icon-icon-muted">
              <Icon name="magnifying-glass" size="small" class="shrink-0" />
              <input
                ref={(el) => (searchRef = el)}
                value={store.search}
                placeholder={language.t("dialog.model.search.placeholder")}
                class="h-7 min-w-0 flex-1 border-0 bg-transparent text-[13px] font-[440] leading-5 text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
                spellcheck={false}
                autocorrect="off"
                autocomplete="off"
                autocapitalize="off"
                onInput={(event) => setSearch(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Tab") return
                  event.stopPropagation()
                  if (event.key === "Escape") {
                    event.preventDefault()
                    restoreTrigger = false
                    setOpen(false)
                    afterClose(() => props.onClose?.())
                    return
                  }
                  if (event.altKey || event.metaKey) return
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    moveActive(1)
                    return
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault()
                    moveActive(-1)
                    return
                  }
                  if (event.key === "Enter" && !event.isComposing) {
                    event.preventDefault()
                    selectActive()
                  }
                }}
              />
              <Show when={store.search.trim()}>
                <button
                  type="button"
                  class="flex size-5 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setSearch("")}
                  aria-label={language.t("common.clear")}
                >
                  <Icon name="close" size="small" />
                </button>
              </Show>
            </div>
          </div>
          <div class="h-px bg-v2-border-border-muted" />
          <ScrollView data-slot="model-selector-scroll" class="max-h-[220px] min-h-0">
            <div class="flex flex-col p-0.5 pt-0">
              <Show
                when={models().length > 0}
                fallback={
                  <div class="flex h-12 items-center px-3 text-[13px] font-[440] leading-5 text-v2-text-text-faint">
                    {language.t("dialog.model.empty")}
                  </div>
                }
              >
                <For each={groups()}>
                  {(group) => (
                    <MenuV2.Group>
                      <MenuV2.GroupLabel class="gap-2 px-3">
                        <span class="min-w-0 truncate">{group.items[0].provider.name}</span>
                      </MenuV2.GroupLabel>
                      <MenuV2.RadioGroup value={current()}>
                        <For each={group.items}>
                          {(item) => (
                            <MenuV2.RadioItem
                              value={modelKey(item)}
                              data-option-key={modelKey(item)}
                              data-selected-model={current() === modelKey(item) ? true : undefined}
                              class="scroll-my-6"
                              classList={{ "!bg-v2-overlay-simple-overlay-hover": store.active === modelKey(item) }}
                              onMouseEnter={() => {
                                setStore("active", modelKey(item))
                                setTimeout(() => searchRef?.focus())
                              }}
                              onSelect={() => selectModel(item)}
                            >
                              <span class="min-w-0 truncate">{item.name}</span>
                              <Show when={isFree(item.provider.id, item.cost)}>
                                <TagV2 class="shrink-0">{language.t("model.tag.free")}</TagV2>
                              </Show>
                              <Show when={item.latest}>
                                <TagV2 class="shrink-0">{language.t("model.tag.latest")}</TagV2>
                              </Show>
                            </MenuV2.RadioItem>
                          )}
                        </For>
                      </MenuV2.RadioGroup>
                    </MenuV2.Group>
                  )}
                </For>
              </Show>
            </div>
          </ScrollView>
          <Show when={canManage()}>
            <div class="h-px bg-v2-border-border-muted" />
            <div class="flex flex-col p-0.5">
              <MenuV2.Item
                data-option-key={manageKey}
                classList={{ "!bg-v2-overlay-simple-overlay-hover": store.active === manageKey }}
                onMouseEnter={() => {
                  setStore("active", manageKey)
                  setTimeout(() => searchRef?.focus())
                }}
                onSelect={manage}
              >
                <Icon name="outline-sliders" size="small" />
                <span class="min-w-0 flex-1 truncate leading-5">{language.t("dialog.model.manage")}</span>
              </MenuV2.Item>
            </div>
          </Show>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}
