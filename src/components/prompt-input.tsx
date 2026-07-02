import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import type { ModelLoadStatus, ModelOption } from "@/context/models"
import type { ModelSelection } from "@/context/local"
import type { PromptAttachment } from "@/context/sync"
import { ModelSelectorControl } from "@/components/dialog-select-model"
import { createPromptAttachments } from "@/components/prompt-input/attachments"
import { ACCEPTED_FILE_TYPES } from "@/components/prompt-input/files"
import { PromptImageAttachments } from "@/components/prompt-input/image-attachments"
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
      <PromptImageAttachments
        attachments={props.attachments}
        disabled={props.disabled}
        onRemove={props.onAttachmentRemove}
      />
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
          <ModelSelectorControl
            models={props.models}
            selectedModel={props.selectedModel}
            modelStatus={props.modelStatus}
            disabled={props.disabled}
            open={transient.modelOpen}
            setOpen={transient.setModelOpen}
            onSelect={props.onModelSelect}
          />
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
