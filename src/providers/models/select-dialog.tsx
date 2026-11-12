import { Badge } from "@opencode/ui/badge"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Popover } from "@opencode/ui/popover"
import { SearchList, type SearchListHandle } from "@opencode/ui/search-list"
import { TextInput } from "@opencode/ui/text-input"
import { Tooltip } from "@opencode/ui/tooltip"
import { useDialog } from "@opencode/ui/context/dialog"
import { batch, type ComponentProps, createEffect, createMemo, type JSX, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createEventListener } from "@solid-primitives/event-listener"
import "./select-dialog.css"
import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import type { ModelSelectorState } from "@/providers/models/selection"
import { useLanguage } from "@/runtime/i18n/language"
import { compareProviders } from "@/providers/catalog/order"
import { consoleProviderLabels } from "@/providers/catalog/console"
import { createIntegrationCatalog, openAIUsesOAuth, type IntegrationSource } from "@/providers/catalog/integrations"
import { ExternalLink } from "@/runtime/platform/external-link"
import { currentData, currentDirectory } from "@/runtime/server/session-store-compact"
import { sessionEvents } from "@/runtime/server/sync-session-compact"
import { handleDocumentSearchKeydown } from "@/shell/commands/search-keydown"
import { afterMenuClose } from "@/shell/commands/menu-dismiss"
import { matchesModelSearch } from "./search"
import { isFreeModel } from "./models"
import { ModelTooltip } from "./tooltip"
import { ProviderModelIcon } from "./provider-group"

type ModelItem = ReturnType<ModelSelectorState["list"]>[number]

const modelKey = (model: ModelItem) => `${model.provider.id}:${model.id}`

type ModelSelectorTrigger = (props: ComponentProps<"button">) => JSX.Element

export function ModelSelectorPopover(props: {
  provider?: string
  model: ModelSelectorState
  trigger: ModelSelectorTrigger
  onClose?: () => void
}) {
  const dialog = useDialog()
  const integrationSource = () => {
    const data = currentData()
    const directory = currentDirectory()
    return data && directory ? { data, directory } : undefined
  }
  return (
    <ModelSelectorPopoverView
      trigger={props.trigger}
      all={() => props.model.list().filter((item) => !props.provider || item.provider.id === props.provider)}
      visible={props.model.visible}
      current={props.model.current()}
      integrationSource={integrationSource()}
      select={(item) => {
        props.model.set({ modelID: item.id, providerID: item.provider.id }, { recent: true })
        props.onClose?.()
      }}
      onManage={
        DEFAULT_MODEL_CONFIG.manageModels
          ? () => {
              void import("./manage").then((module) => {
                void dialog.show(() => <module.DialogManageModels model={props.model} />)
              })
            }
          : undefined
      }
      onClose={() => props.onClose?.()}
    />
  )
}

export function ModelSelectorPopoverView(props: {
  trigger: ModelSelectorTrigger
  all: () => ModelItem[]
  visible: (model: ModelItem) => boolean
  current: ModelItem | undefined
  integrationSource?: IntegrationSource
  select: (item: ModelItem) => void
  onManage?: () => void
  onClose: () => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore({ open: false, search: "" })
  const selectedKey = () => props.current && modelKey(props.current)
  const integrations = createIntegrationCatalog({
    source: createMemo(() =>
      store.open && props.current?.provider.id === "openai" ? props.integrationSource : undefined,
    ),
    events: sessionEvents,
  })
  const chatgptPlan = createMemo(() => openAIUsesOAuth(integrations.list()))
  const providerLabel = createMemo(() => consoleProviderLabels(props.all().map((item) => item.provider)))
  const models = createMemo(() => {
    const query = store.search.trim()
    return props
      .all()
      .filter(props.visible)
      .filter((item) => !query || matchesModelSearch(query, [item.name, item.id, item.provider.name]))
      .sort((a, b) => a.name.localeCompare(b.name))
  })
  const rows = createMemo(() => models().toSorted((a, b) => compareProviders(a.provider, b.provider)))
  let list: SearchListHandle<ModelItem> | undefined
  let searchRef: HTMLInputElement | undefined
  const setOpen = (open: boolean) => setStore({ open, search: "" })
  const closeWith = (action: () => void) => {
    if (!store.open) return
    afterMenuClose(searchRef, action)
    setOpen(false)
  }
  const setSearch = (value: string) =>
    batch(() => {
      setStore("search", value)
      const first = models()[0]
      list?.setActive(first && modelKey(first))
    })

  createEffect(() => {
    if (!store.open) return
    const frame = requestAnimationFrame(() => {
      searchRef?.focus({ preventScroll: true })
      const id = searchRef?.getAttribute("aria-activedescendant")
      if (id) document.getElementById(id)?.scrollIntoView({ block: "nearest" })
    })
    onCleanup(() => cancelAnimationFrame(frame))
    createEventListener(
      document,
      "keydown",
      (event) => {
        // Space activates a focused footer or clear button.
        if (event.key === " " && event.target instanceof Element && event.target.closest("button, a")) return
        handleDocumentSearchKeydown(searchRef, event, store.search, setSearch)
      },
      true,
    )
  })

  return (
    <Popover
      open={store.open}
      onOpenChange={setOpen}
      modal={false}
      placement="top-start"
      gutter={6}
      triggerAs={props.trigger}
      triggerProps={{
        onKeyDown: (event) => {
          if (!store.open && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault()
            setOpen(true)
          }
        },
      }}
      title={language.t("dialog.model.select.title")}
      class="oc-agent-model-picker"
      classList={{ "with-plan": chatgptPlan() }}
    >
      <div
        data-owns-escape
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented) return
          event.preventDefault()
          event.stopPropagation()
          closeWith(props.onClose)
        }}
      >
        <SearchList
          ref={(handle) => {
            list = handle
            handle.setActive(selectedKey())
            onCleanup(() => {
              list = undefined
              searchRef = undefined
            })
          }}
          query={store.search}
          onQuery={setSearch}
          items={rows()}
          key={modelKey}
          section={(item) => item.provider.id}
          header={(item) => (
            <>
              <ProviderModelIcon provider={item.provider} class="shrink-0" />
              <span class="min-w-0 truncate">{providerLabel()(item.provider).name}</span>
              <Show when={providerLabel()(item.provider).workspace}>
                {(workspace) => <Badge class="shrink-0">{workspace()}</Badge>}
              </Show>
            </>
          )}
          placeholder={language.t("dialog.model.search.placeholder")}
          empty={language.t("dialog.model.empty")}
          onSelect={(item) => closeWith(() => props.select(item))}
          field={(field) => (
            <div class="border-b border-v2-border-border-muted p-0.5">
              <TextInput
                {...field}
                ref={(el) => (searchRef = el)}
                value={store.search}
                placeholder={language.t("dialog.model.search.placeholder")}
                aria-label={language.t("dialog.model.search.placeholder")}
                class="w-full"
                leadingIcon={<Icon name="magnifying-glass" size="small" />}
                showClearButton={!!store.search.trim()}
                clearIcon="close"
                clearLabel={language.t("common.clear")}
                onClearClick={() => {
                  setSearch("")
                  searchRef?.focus()
                }}
                spellcheck={false}
                autocorrect="off"
                autocomplete="off"
                autocapitalize="off"
                onKeyDown={(event) => {
                  if (event.key === "Escape" || event.key === "Tab") return
                  event.stopPropagation()
                  if (event.isComposing || event.altKey || event.metaKey) return
                  if (event.key === "Enter") return field.onKeyDown(event)
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
                  // Ctrl/Shift arrows advance a single row. Home and End edit the query.
                  if (!event.ctrlKey && !event.shiftKey) return field.onKeyDown(event)
                  event.preventDefault()
                  field.onKeyDown(new KeyboardEvent("keydown", { key: event.key }))
                }}
              />
            </div>
          )}
        >
          {(item, attrs) => (
            <Tooltip
              class="w-full"
              placement="right-start"
              gutter={6}
              openDelay={0}
              value={<ModelTooltip model={item()} latest={item().latest} free={isFreeModel(item())} />}
            >
              <button
                {...attrs}
                type="button"
                tabIndex={-1}
                data-size="compact"
                data-option-key={modelKey(item())}
                aria-current={modelKey(item()) === selectedKey() ? "true" : undefined}
                class="text-[13px] font-[440] leading-5"
              >
                <span class="min-w-0 truncate">{item().name}</span>
                <Show when={isFreeModel(item())}>
                  <Badge class="shrink-0">{language.t("model.tag.free")}</Badge>
                </Show>
                <Show when={item().latest}>
                  <Badge class="shrink-0">{language.t("model.tag.latest")}</Badge>
                </Show>
                <Show when={modelKey(item()) === selectedKey()}>
                  <Icon name="check" size="small" class="ms-auto shrink-0" />
                </Show>
              </button>
            </Tooltip>
          )}
        </SearchList>
        <Show when={props.onManage}>
          {(manage) => (
            <div class="border-t border-v2-border-border-muted p-0.5">
              <Button
                variant="ghost"
                size="normal"
                icon="outline-sliders"
                class="w-full !justify-start"
                onClick={() => closeWith(manage())}
              >
                {language.t("dialog.model.manage")}
              </Button>
            </div>
          )}
        </Show>
        <Show when={chatgptPlan()}>
          <div class="h-px bg-v2-border-border-muted" />
          <div class="flex min-h-10 items-center gap-2 px-3 py-2 text-[13px] leading-5 text-v2-text-text-base">
            <ProviderModelIcon provider={{ id: "openai", name: "OpenAI" }} class="shrink-0" />
            <span class="min-w-0 flex-1 truncate">{language.t("dialog.model.chatgptPlan")}</span>
            <ExternalLink
              href="https://chatgpt.com/settings/usage"
              class="flex shrink-0 items-center gap-1 rounded-sm text-v2-text-text-muted no-underline hover:text-v2-text-text-base focus-visible:outline focus-visible:outline-2"
            >
              {language.t("dialog.model.chatgptManageUsage")}
              <Icon name="arrow-up-right" size="small" />
            </ExternalLink>
          </div>
        </Show>
      </div>
    </Popover>
  )
}
