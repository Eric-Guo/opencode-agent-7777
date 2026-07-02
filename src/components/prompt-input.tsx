import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, For, Show } from "solid-js"
import type { ModelLoadStatus, ModelOption } from "@/context/models"
import type { ModelSelection } from "@/context/local"
import type { PromptAttachment } from "@/context/sync"
import { createPromptAttachments } from "@/components/prompt-input/attachments"
import { ACCEPTED_FILE_TYPES } from "@/components/prompt-input/files"
import { createPromptInputTransientState } from "@/components/prompt-input/transient-state"

export function PromptInput(props: {
  value: string
  attachments: PromptAttachment[]
  disabled: boolean
  busy: boolean
  canSubmit: boolean
  placeholder: string
  models: ModelOption[]
  selectedModel: ModelSelection | undefined
  modelStatus: ModelLoadStatus
  onChange: (value: string) => void
  onAttachmentAdd: (attachment: PromptAttachment) => void
  onAttachmentRemove: (id: string) => void
  onAttachmentError: (message: string) => void
  onModelSelect: (model: ModelSelection) => void
  onSubmit: () => void
  onAbort: () => void
}) {
  const transient = createPromptInputTransientState()
  let fileInputRef: HTMLInputElement | undefined
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
    transient.setModelOpen(false)
  }

  const addFiles = async (files: File[]) => {
    const result = await createPromptAttachments(files)
    for (const attachment of result.attachments) props.onAttachmentAdd(attachment)
    if (result.unsupported) props.onAttachmentError("Some selected files are not supported.")
  }

  return (
    <div class="mx-auto min-w-0 max-w-[1120px] rounded-[14px] border border-[#44464a] bg-[#121213] shadow-[0_12px_36px_rgba(0,0,0,0.2)]">
      <input
        ref={(el) => (fileInputRef = el)}
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES.join(",")}
        class="hidden"
        onChange={(event) => {
          const files = event.currentTarget.files
          if (files) void addFiles(Array.from(files))
          event.currentTarget.value = ""
        }}
      />
      <textarea
        class="block max-h-[180px] min-h-[92px] w-full resize-y border-0 bg-transparent px-5 pb-2.5 pt-[18px] text-[15px] leading-[1.5] text-[#e2e2e2] outline-none placeholder:text-[#6e7074] disabled:opacity-[0.62]"
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
      <Show when={props.attachments.length > 0}>
        <div class="flex flex-wrap gap-2 border-t border-[#232426] px-[18px] py-2">
          <For each={props.attachments}>
            {(attachment) => (
              <span class="flex h-7 max-w-[220px] items-center gap-1.5 rounded-md border border-[#303236] bg-[#191a1d] pl-2.5 pr-1 text-[12px] font-[560] text-[#c5c7cb]">
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{attachment.filename}</span>
                <button
                  type="button"
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded border-0 bg-transparent text-[#85878c] hover:enabled:bg-[#25272b] hover:enabled:text-[#e1e2e4] disabled:opacity-60 [&_[data-component=icon]]:h-3 [&_[data-component=icon]]:w-3"
                  aria-label={`Remove ${attachment.filename}`}
                  disabled={props.disabled}
                  onClick={() => props.onAttachmentRemove(attachment.id)}
                >
                  <Icon name="close" />
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>
      <div class="flex min-h-[54px] items-center justify-between gap-3 border-t border-[#232426] py-0 pl-[18px] pr-3.5 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:px-3 max-[720px]:py-2.5">
        <div class="flex min-w-0 items-center gap-3.5 max-[720px]:w-full max-[720px]:flex-wrap">
          <button
            type="button"
            class="flex h-[30px] w-[30px] items-center justify-center rounded-lg border-0 bg-transparent text-[#8d8f93] opacity-100 hover:enabled:bg-[#232428] hover:enabled:text-[#e1e2e4] disabled:opacity-60 [&_[data-component=icon]]:h-[19px] [&_[data-component=icon]]:w-[19px]"
            aria-label="Add context"
            disabled={props.disabled}
            onClick={() => fileInputRef?.click()}
          >
            <Icon name="plus" />
          </button>
          <span class="shrink-0 text-[13px] font-[650] leading-none text-[#9b9da1]">7777</span>
          <div
            class="relative min-w-0 max-w-[220px] text-[#9b9da1]"
            onFocusOut={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              transient.setModelOpen(false)
            }}
          >
            <button
              type="button"
              class="flex h-[30px] max-w-[220px] items-center gap-2 border-0 bg-transparent p-0 text-[13px] font-[650] text-[#a8aaae] outline-none hover:enabled:text-[#e1e2e4] disabled:opacity-60 aria-expanded:text-[#e1e2e4] [&_[data-component=icon]]:h-4 [&_[data-component=icon]]:w-4 [&_[data-component=icon]]:shrink-0"
              aria-label="Model"
              aria-expanded={transient.modelOpen()}
              aria-haspopup="listbox"
              disabled={!canOpenModel()}
              onClick={() => transient.setModelOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                transient.setModelOpen(false)
              }}
            >
              <Icon name="models" />
              <span class="min-w-0 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">{modelLabel()}</span>
              <Icon name="chevron-down" />
            </button>
            <Show when={transient.modelOpen()}>
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
        </div>
        <button
          type={props.busy ? "button" : "submit"}
          class="flex h-[34px] min-h-[34px] w-[34px] min-w-[34px] cursor-default items-center justify-center rounded-lg border border-[#2c2d30] bg-[#1b1c1e] text-[#d7d8da] hover:enabled:bg-[#232428] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b5d63] disabled:bg-transparent disabled:text-[#56585c] max-[720px]:self-end [&_[data-component=icon]]:h-5 [&_[data-component=icon]]:w-5"
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
