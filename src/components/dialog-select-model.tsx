import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, For, Show, type Accessor, type Setter } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ModelSelection } from "@/context/local"
import type { ModelLoadStatus, ModelOption } from "@/context/models"

export function ModelSelectorControl(props: {
  models: ModelOption[]
  selectedModel: ModelSelection | undefined
  modelStatus: ModelLoadStatus
  disabled: boolean
  open: Accessor<boolean>
  setOpen: Setter<boolean>
  onSelect: (model: ModelSelection) => void
}) {
  const language = useLanguage()
  const selectedModel = createMemo(() =>
    props.models.find(
      (model) => model.providerID === props.selectedModel?.providerID && model.modelID === props.selectedModel.modelID,
    ),
  )
  const modelLabel = createMemo(() => {
    if (props.modelStatus === "loading") return language.t("model.loading")
    return selectedModel()?.modelName ?? language.t("model.default")
  })
  const groupedModels = createMemo(() => {
    const groups = new Map<string, ModelOption[]>()
    for (const model of props.models) {
      const group = groups.get(model.providerName)
      if (group) group.push(model)
      else groups.set(model.providerName, [model])
    }
    return Array.from(groups, ([providerName, models]) => ({ providerName, models }))
  })
  const canOpenModel = createMemo(() => !props.disabled && props.modelStatus !== "loading" && props.models.length > 0)

  const selectModel = (model: ModelOption) => {
    props.onSelect({ providerID: model.providerID, modelID: model.modelID })
    props.setOpen(false)
  }

  return (
    <div
      class="relative min-w-0 max-w-[220px] text-[var(--oc-7777-composer-control-fg)]"
      onFocusOut={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        props.setOpen(false)
      }}
    >
      <button
        type="button"
        class="group flex h-7 min-w-0 max-w-[220px] items-center justify-start gap-1.5 rounded-sm border-0 bg-transparent px-2 text-[13px] font-[440] leading-5 text-[var(--oc-7777-composer-control-fg)] outline-none hover:enabled:bg-[var(--oc-7777-composer-control-bg-hover)] hover:enabled:text-[var(--oc-7777-composer-control-fg-hover)] disabled:opacity-60 aria-expanded:bg-[var(--oc-7777-composer-control-bg-pressed)] aria-expanded:text-[var(--oc-7777-composer-control-fg-hover)] [&_[data-component=icon]]:shrink-0 [&_[data-slot=icon-svg]]:size-4"
        aria-label={language.t("model.aria")}
        aria-expanded={props.open()}
        aria-haspopup="listbox"
        disabled={!canOpenModel()}
        onClick={() => props.setOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          props.setOpen(false)
        }}
      >
        <Icon
          name="models"
          class="text-[var(--oc-7777-composer-control-icon)] transition-colors duration-150 group-hover:text-[var(--oc-7777-composer-control-icon-hover)]"
        />
        <span class="min-w-0 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">{modelLabel()}</span>
        <span class="-ml-0.5 -mr-1 flex shrink-0">
          <Icon name="chevron-down" size="small" class="text-[var(--oc-7777-composer-control-icon)]" />
        </span>
      </button>
      <Show when={props.open()}>
        <div
          class="absolute bottom-[calc(100%+8px)] left-0 z-30 flex max-h-80 w-80 max-w-[min(320px,calc(100vw-36px))] flex-col overflow-y-auto rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 p-1.5 shadow-[var(--v2-elevation-floating)]"
          role="listbox"
          aria-label={language.t("model.aria")}
        >
          <For each={groupedModels()}>
            {(group) => (
              <div class="[&+&]:mt-1.5">
                <div class="px-[9px] pb-1 pt-[7px] text-[11px] font-bold uppercase leading-none text-v2-text-text-faint">
                  {group.providerName}
                </div>
                <For each={group.models}>
                  {(model) => {
                    const selected = () =>
                      model.providerID === props.selectedModel?.providerID &&
                      model.modelID === props.selectedModel.modelID
                    return (
                      <button
                        type="button"
                        class={`flex min-h-8 w-full items-center justify-between gap-2.5 rounded-md border-0 px-2 py-0 text-left text-[13px] font-[560] hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base ${
                          selected()
                            ? "bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base"
                            : "bg-transparent text-v2-text-text-muted"
                        }`}
                        role="option"
                        aria-selected={selected()}
                        onClick={() => selectModel(model)}
                      >
                        <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                          {model.modelName || model.modelID}
                        </span>
                        <Show when={selected()}>
                          <Icon name="check-small" class="h-[15px] w-[15px] shrink-0 text-v2-icon-icon-base" />
                        </Show>
                      </button>
                    )
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
