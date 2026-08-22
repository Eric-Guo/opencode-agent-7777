import { ComposerEditor } from "@opencode-ai/app/composer/editor"
import { createComposerEditor } from "@opencode-ai/app/composer/editor/interaction"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, Show } from "solid-js"
import { DialogManageModelsV2 } from "@/providers/models/manage"
import { ModelSelectorPopoverV2 } from "@/providers/models/select-dialog"
import { ACCEPTED_FILE_EXTENSIONS } from "@/runtime/platform/file-picker"
import { useLanguage } from "@/runtime/i18n/language"
import type { ModelLoadStatus, ModelSelectorState } from "@/providers/models/store-compact"
import { prompt } from "@/composer/persistence-singleton"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"
import { createPersistedBlobReference } from "@/runtime/persistence/drafts-local"

const attachmentPaths = new WeakMap<File, string>()

async function openDesktopAttachmentPicker(
  options: {
    defaultPath?: string
    multiple?: boolean
    accept?: string[]
  },
  onFile: (file: File) => Promise<unknown>,
) {
  const api = window.api
  if (!api?.openFilePicker || !api.readPickedFile || !api.releasePickedFiles) return
  const result = await api.openFilePicker({
    multiple: options.multiple ?? false,
    defaultPath: options.defaultPath,
    extensions: ACCEPTED_FILE_EXTENSIONS,
  })
  if (!result) return
  try {
    for (const file of result.files) {
      const selected = new File([await api.readPickedFile(result.token, file.path)], file.name)
      attachmentPaths.set(selected, file.path)
      await onFile(selected)
    }
  } finally {
    await api.releasePickedFiles(result.token)
  }
}

function getDesktopPathForFile(file: File) {
  return attachmentPaths.get(file) ?? window.api?.getPathForFile?.(file) ?? ""
}

async function readDesktopClipboardImage() {
  const image = await window.api?.readClipboardImage?.().catch(() => null)
  if (!image) return null
  return new File([new Blob([image.buffer], { type: "image/png" })], `pasted-image-${Date.now()}.png`, {
    type: "image/png",
  })
}

export function PromptInputV2Composer(props: {
  disabled: boolean
  busy: boolean
  placeholder: string
  model: ModelSelectorState
  modelStatus: ModelLoadStatus
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
  const controller = createComposerEditor({
    store: prompt.store,
    identity: () => state.session?.id,
    onChange: prompt.persist,
    capabilities: {
      commands: false,
      context: false,
      shell: false,
    },
    commands: () => [],
    context: () => [],
    searchContextFiles: () => [],
    attachments: {
      picker: window.api?.openFilePicker ? openDesktopAttachmentPicker : undefined,
      directory: () => "",
      isDialogActive: () => props.disabled || !!dialog.active,
      warn: () => props.onAttachmentError(language.t("prompt.unsupportedFiles")),
      duplicate: () => props.onAttachmentError(language.t("prompt.attachmentDuplicate")),
      onError: (error) => props.onAttachmentError(error instanceof Error ? error.message : String(error)),
      readClipboardImage: window.api?.readClipboardImage ? readDesktopClipboardImage : undefined,
      getPathForFile: window.api?.getPathForFile ? getDesktopPathForFile : undefined,
      store: createPersistedBlobReference,
    },
    view: {
      placeholder: () => props.placeholder,
      submit: {
        stopping: () => props.busy,
        working: () => props.busy,
        onSubmit: props.onSubmit,
        onStop: props.onAbort,
      },
    },
  })

  return (
    <ComposerEditor
      controller={controller}
      disabled={props.disabled}
      class="mx-auto max-w-[1120px]"
      labels={{
        dropFiles: language.t("prompt.dropzone.label"),
        removeAttachment: language.t("prompt.removeAttachment.generic"),
        prompt: language.t("prompt.message.aria"),
        add: language.t("prompt.attachFiles"),
        attach: language.t("prompt.attachFiles"),
        chooseModel: language.t("model.aria"),
        send: language.t("prompt.send"),
        stop: language.t("prompt.stop"),
      }}
      agentControl={
        <span class="flex h-7 shrink-0 items-center rounded-sm px-2 text-[13px] font-[440] leading-5 text-v2-text-text-muted">
          {currentLocalAgent()}
        </span>
      }
      modelControl={
        <Show when={props.modelStatus !== "loading"}>
          <ModelSelectorPopoverV2
            model={props.model}
            triggerAs={Button}
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
            <Show when={selectedModel()?.provider.id}>
              {(providerID) => <ProviderIcon id={providerID()} class="size-4 shrink-0 opacity-60" />}
            </Show>
            <span class="truncate">{modelName()}</span>
            <span class="-ml-0.5 -mr-1 flex shrink-0">
              <Icon name="chevron-down" size="small" class="text-v2-icon-icon-muted" />
            </span>
          </ModelSelectorPopoverV2>
        </Show>
      }
    />
  )
}
