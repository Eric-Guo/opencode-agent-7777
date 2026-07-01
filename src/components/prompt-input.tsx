import { Icon } from "@opencode-ai/ui/icon"
import { For, Show } from "solid-js"
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
  const selectedModelValue = () =>
    props.selectedModel ? `${props.selectedModel.providerID}:${props.selectedModel.modelID}` : ""

  return (
    <>
      <div class="composer-toolbar">
        <label for="prompt-model-select">Model</label>
        <select
          id="prompt-model-select"
          aria-label="Model"
          value={selectedModelValue()}
          disabled={props.disabled || props.modelStatus === "loading" || props.models.length === 0}
          onChange={(event) => {
            const value = event.currentTarget.value
            const model = props.models.find((item) => `${item.providerID}:${item.modelID}` === value)
            if (!model) return
            props.onModelSelect({ providerID: model.providerID, modelID: model.modelID })
          }}
        >
          <Show
            when={props.models.length > 0}
            fallback={<option value="">{props.modelStatus === "loading" ? "Loading models" : "Server default"}</option>}
          >
            <For each={props.models}>
              {(model) => (
                <option value={`${model.providerID}:${model.modelID}`}>
                  {model.providerName} / {model.modelName}
                </option>
              )}
            </For>
          </Show>
        </select>
      </div>
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
    </>
  )
}
