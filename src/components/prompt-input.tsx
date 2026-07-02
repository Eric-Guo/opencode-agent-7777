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
    <div class="mx-auto min-w-0 max-w-[1120px] rounded-xl bg-[var(--oc-7777-composer-bg)] shadow-[var(--oc-7777-composer-shadow)]">
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
        class="block max-h-[180px] min-h-[52px] w-full resize-y border-0 bg-transparent px-4 pb-2 pt-4 text-[13px] font-[440] leading-5 text-[var(--oc-7777-composer-text)] outline-none placeholder:text-[var(--oc-7777-composer-placeholder)] disabled:opacity-[0.62]"
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
      <div class="flex h-11 items-center justify-between gap-2 px-2">
        <div class="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded-md border-0 bg-transparent p-[6px] text-[var(--oc-7777-composer-control-icon)] opacity-100 hover:enabled:bg-[var(--oc-7777-composer-control-bg-hover)] hover:enabled:text-[var(--oc-7777-composer-control-icon-hover)] disabled:opacity-60 [&_[data-component=icon]]:size-4 [&_[data-slot=icon-svg]]:size-4"
            aria-label="Add context"
            disabled={props.disabled}
            onClick={() => fileInputRef?.click()}
          >
            <Icon name="plus" />
          </button>
          <span class="flex h-7 shrink-0 items-center rounded-sm px-2 text-[13px] font-[440] leading-5 text-[var(--oc-7777-composer-control-fg)]">
            7777
          </span>
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
          class="flex size-7 shrink-0 cursor-default items-center justify-center rounded-md border-0 bg-[linear-gradient(180deg,var(--v2-alpha-light-20)_0%,var(--v2-alpha-light-0)_100%),linear-gradient(90deg,var(--v2-background-bg-contrast)_0%,var(--v2-background-bg-contrast)_100%)] p-[6px] text-v2-icon-icon-muted shadow-[var(--v2-elevation-button-contrast)] hover:enabled:bg-v2-overlay-simple-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-active disabled:bg-transparent disabled:opacity-50 [&_[data-component=icon]]:size-4 [&_[data-slot=icon-svg]]:size-4"
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
