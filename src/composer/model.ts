import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/runtime/i18n/language"
import { createPersistedBlobReference } from "@/runtime/persistence/drafts"
import { createPlatformAttachments } from "@/runtime/platform/platform-bridge"
import type { ComposerAdapter, ComposerControls } from "./adapter"
import { createComposerEditor, type ComposerEditorModel } from "./editor/interaction"

export type ComposerModel = ComposerEditorModel & {
  readonly model: ComposerControls["model"]
  readonly agent: string
  disabled: ComposerAdapter["disabled"]
}

export function createComposerModel(adapter: ComposerAdapter): ComposerModel {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = createPlatformAttachments()
  const controller = createComposerEditor({
    store: adapter.state.store,
    identity: adapter.identity,
    onChange: adapter.state.persist,
    capabilities: {
      commands: false,
      context: false,
      shell: false,
    },
    commands: () => [],
    context: () => [],
    searchContextFiles: () => [],
    attachments: {
      picker: platform.openAttachmentPickerDialog,
      directory: () => "",
      isDialogActive: () => adapter.disabled() || !!dialog.active,
      warn: () => adapter.onAttachmentError(language.t("prompt.unsupportedFiles")),
      duplicate: () => adapter.onAttachmentError(language.t("prompt.attachmentDuplicate")),
      onError: (error) => adapter.onAttachmentError(error instanceof Error ? error.message : String(error)),
      readClipboardImage: platform.readClipboardImage,
      getPathForFile: platform.getPathForFile,
      store: createPersistedBlobReference,
    },
    view: {
      placeholder: adapter.placeholder,
      submit: {
        stopping: adapter.working,
        working: adapter.working,
        onSubmit: adapter.submit,
        onStop: adapter.interrupt,
      },
    },
  })

  return {
    ...controller,
    get model() {
      return adapter.controls().model
    },
    get agent() {
      return adapter.controls().agent
    },
    disabled: adapter.disabled,
  }
}
