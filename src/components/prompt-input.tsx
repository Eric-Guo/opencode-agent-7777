import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, For, Show } from "solid-js"
import type { ModelOption, ModelLoadStatus } from "@/context/sync"
import type { ModelSelection } from "@/context/local"

export function PromptInput(props: {
  value: string
  disabled: boolean
  busy: boolean
  canSubmit: boolean
  placeholder: string
  models: ModelOption[]
  selectedModel: ModelSelection | undefined
  modelStatus: ModelLoadStatus
  onChange: (value: string) => void
  onModelSelect: (model: ModelSelection) => void
  onSubmit: () => void
  onAbort: () => void
}) {
  const [modelOpen, setModelOpen] = createSignal(false)
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
    props.onModelSelect({ providerID: model.providerID, modelID: model.modelID })
    setModelOpen(false)
  }

  return (
    <div class="composer-panel">
      <textarea
        aria-label="Message"
        placeholder={props.placeholder}
        value={props.value}
        disabled={props.disabled}
        onInput={(event) => props.onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return
          event.preventDefault()
          props.onSubmit()
        }}
      />
      <div class="composer-footer">
        <div class="composer-controls">
          <button type="button" class="composer-icon-button" aria-label="Add context" disabled>
            <Icon name="plus" />
          </button>
          <span class="composer-agent">7777</span>
          <div
            class="composer-model"
            onFocusOut={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setModelOpen(false)
            }}
          >
            <button
              type="button"
              class="composer-model-trigger"
              aria-label="Model"
              aria-expanded={modelOpen()}
              aria-haspopup="listbox"
              disabled={!canOpenModel()}
              onClick={() => setModelOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                setModelOpen(false)
              }}
            >
              <Icon name="models" />
              <span>{modelLabel()}</span>
              <Icon name="chevron-down" />
            </button>
            <Show when={modelOpen()}>
              <div class="composer-model-popover" role="listbox" aria-label="Model">
                <For each={groupedModels()}>
                  {(group) => (
                    <div class="composer-model-group">
                      <div class="composer-model-group-label">{group.providerName}</div>
                      <For each={group.models}>
                        {(model) => {
                          const selected = () =>
                            model.providerID === props.selectedModel?.providerID &&
                            model.modelID === props.selectedModel.modelID
                          return (
                            <button
                              type="button"
                              class="composer-model-option"
                              classList={{ selected: selected() }}
                              role="option"
                              aria-selected={selected()}
                              onClick={() => selectModel(model)}
                            >
                              <span>{model.modelName || model.modelID}</span>
                              <Show when={selected()}>
                                <Icon name="check-small" />
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
        </div>
        <button
          type={props.busy ? "button" : "submit"}
          class="submit-button"
          aria-label={props.busy ? "Stop" : "Send"}
          disabled={!props.busy && !props.canSubmit}
          onClick={() => {
            if (props.busy) props.onAbort()
          }}
        >
          <Show when={props.busy} fallback={<Icon name="arrow-up" />}>
            <Icon name="stop" />
          </Show>
        </button>
      </div>
    </div>
  )
}
