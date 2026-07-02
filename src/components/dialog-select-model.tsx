import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, For, Show, type Accessor, type Setter } from "solid-js"
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
  const selectedModel = createMemo(() =>
    props.models.find(
      (model) => model.providerID === props.selectedModel?.providerID && model.modelID === props.selectedModel.modelID,
    ),
  )
  const modelLabel = createMemo(() => {
    if (props.modelStatus === "loading") return "Loading models"
    return selectedModel()?.modelName ?? "Server default"
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
      class="relative min-w-0 max-w-[220px] text-[#9b9da1]"
      onFocusOut={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        props.setOpen(false)
      }}
    >
      <button
        type="button"
        class="flex h-[30px] max-w-[220px] items-center gap-2 border-0 bg-transparent p-0 text-[13px] font-[650] text-[#a8aaae] outline-none hover:enabled:text-[#e1e2e4] disabled:opacity-60 aria-expanded:text-[#e1e2e4] [&_[data-component=icon]]:h-4 [&_[data-component=icon]]:w-4 [&_[data-component=icon]]:shrink-0"
        aria-label="Model"
        aria-expanded={props.open()}
        aria-haspopup="listbox"
        disabled={!canOpenModel()}
        onClick={() => props.setOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          props.setOpen(false)
        }}
      >
        <Icon name="models" />
        <span class="min-w-0 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">{modelLabel()}</span>
        <Icon name="chevron-down" />
      </button>
      <Show when={props.open()}>
        <div
          class="absolute bottom-[calc(100%+8px)] left-0 z-30 flex max-h-80 w-80 max-w-[min(320px,calc(100vw-36px))] flex-col overflow-y-auto rounded-lg border border-[#34363a] bg-[#191a1d] p-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.46)]"
          role="listbox"
          aria-label="Model"
        >
          <For each={groupedModels()}>
            {(group) => (
              <div class="[&+&]:mt-1.5">
                <div class="px-[9px] pb-1 pt-[7px] text-[11px] font-bold uppercase leading-none text-[#73757a]">
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
                        class={`flex min-h-8 w-full items-center justify-between gap-2.5 rounded-md border-0 px-2 py-0 text-left text-[13px] font-[560] hover:bg-[#24262a] hover:text-[#f0f0f1] focus-visible:bg-[#24262a] focus-visible:text-[#f0f0f1] ${
                          selected() ? "bg-[#2c3137] text-[#f5f5f5]" : "bg-transparent text-[#c9cace]"
                        }`}
                        role="option"
                        aria-selected={selected()}
                        onClick={() => selectModel(model)}
                      >
                        <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                          {model.modelName || model.modelID}
                        </span>
                        <Show when={selected()}>
                          <Icon name="check-small" class="h-[15px] w-[15px] shrink-0 text-[#d8d9dc]" />
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
