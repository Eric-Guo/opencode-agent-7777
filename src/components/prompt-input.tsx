import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { createMemo, Show } from "solid-js"
import { DialogManageModelsV2 } from "@/components/dialog-manage-models"
import { useLanguage } from "@/context/language"
import type { ModelLoadStatus, ModelSelectorState } from "@/context/models"
import type { PromptAttachment } from "@/context/sync"
import { ModelSelectorPopoverV2 } from "@/components/dialog-select-model"
import { createPromptAttachments } from "@/components/prompt-input/attachments"
import { ACCEPTED_FILE_TYPES } from "@/components/prompt-input/files"
import { PromptImageAttachments } from "@/components/prompt-input/image-attachments"

export function PromptInput(props: {
  value: string
  attachments: PromptAttachment[]
  disabled: boolean
  busy: boolean
  canSubmit: boolean
  placeholder: string
  model: ModelSelectorState
  modelStatus: ModelLoadStatus
  onChange: (value: string) => void
  onAttachmentAdd: (attachment: PromptAttachment) => void
  onAttachmentRemove: (id: string) => void
  onAttachmentError: (message: string) => void
  onSubmit: () => void
  onAbort: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const selectedModel = createMemo(() => props.model.current())
  const modelName = createMemo(() => {
    if (props.modelStatus === "loading") return language.t("model.loading")
    return selectedModel()?.name ?? language.t("dialog.model.select.title")
  })
  const modelDisabled = createMemo(
    () =>
      props.disabled ||
      props.modelStatus !== "ready" ||
      !props.model.list().some((item) => props.model.visible({ modelID: item.id, providerID: item.provider.id })),
  )
  let fileInputRef: HTMLInputElement | undefined
  const addFiles = async (files: File[]) => {
    const result = await createPromptAttachments(files)
    for (const attachment of result.attachments) props.onAttachmentAdd(attachment)
    if (result.unsupported) props.onAttachmentError(language.t("prompt.unsupportedFiles"))
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
        aria-label={language.t("prompt.message.aria")}
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
            aria-label={language.t("prompt.addContext")}
            disabled={props.disabled}
            onClick={() => fileInputRef?.click()}
          >
            <Icon name="plus" />
          </button>
          <span class="flex h-7 shrink-0 items-center rounded-sm px-2 text-[13px] font-[440] leading-5 text-[var(--oc-7777-composer-control-fg)]">
            7777
          </span>
          <Show when={props.modelStatus !== "loading"}>
            <ModelSelectorPopoverV2
              model={props.model}
              triggerAs={ButtonV2}
              triggerProps={{
                variant: "ghost-muted",
                size: "normal",
                disabled: modelDisabled(),
                class: "min-w-0 max-w-[220px] justify-start ![font-weight:440] group",
                "data-action": "prompt-model",
                "aria-label": language.t("model.aria"),
              }}
              onManage={() => dialog.show(() => <DialogManageModelsV2 model={props.model} />)}
            >
              <Icon
                name="models"
                class="size-4 shrink-0 text-v2-icon-icon-muted transition-colors duration-150 group-hover:text-v2-icon-icon-base"
              />
              <span class="truncate">{modelName()}</span>
              <span class="-ml-0.5 -mr-1 flex shrink-0">
                <IconV2 name="chevron-down" size="small" class="text-v2-icon-icon-muted" />
              </span>
            </ModelSelectorPopoverV2>
          </Show>
        </div>
        <button
          type={props.busy ? "button" : "submit"}
          class="flex size-7 shrink-0 cursor-default items-center justify-center rounded-md border-0 bg-[linear-gradient(180deg,var(--v2-alpha-light-20)_0%,var(--v2-alpha-light-0)_100%),linear-gradient(90deg,var(--v2-background-bg-contrast)_0%,var(--v2-background-bg-contrast)_100%)] p-[6px] text-v2-icon-icon-muted shadow-[var(--v2-elevation-button-contrast)] hover:enabled:bg-v2-overlay-simple-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-active disabled:bg-transparent disabled:opacity-50 [&_[data-component=icon]]:size-4 [&_[data-slot=icon-svg]]:size-4"
          aria-label={props.busy ? language.t("prompt.stop") : language.t("prompt.send")}
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
