import { useDialog } from "@opencode/ui/context/dialog"
import { createEffect } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { createPersistedBlobReference } from "@/runtime/persistence/drafts"
import { createPlatformAttachments } from "@/runtime/platform/platform-bridge"
import { state } from "@/runtime/server/session-store-compact"
import type { ComposerAdapter, ComposerControls, ComposerQueue } from "./adapter"
import { useComposerCommands } from "./commands"
import { createComposerEditor, type ComposerEditorModel } from "./editor/interaction"
import { composerHistory } from "./history/store"

export type ComposerModel = ComposerEditorModel & {
  readonly model: ComposerControls["model"]
  readonly agent: string
  disabled: ComposerAdapter["disabled"]
}

export function createComposerModel(adapter: ComposerAdapter, options?: { queue?: ComposerQueue }): ComposerModel {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = createPlatformAttachments()
  const commands = useComposerCommands({
    model: () => adapter.controls().model.selection,
    disabled: () => adapter.disabled() || adapter.controls().model.status !== "ready" || !!dialog.active,
    isMac: typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform),
  })
  const controller = createComposerEditor({
    store: adapter.state.store,
    identity: adapter.identity,
    onChange: adapter.state.persist,
    history: composerHistory,
    capabilities: {
      commands: false,
      context: false,
      shell: false,
    },
    commands: () => [],
    context: () => [],
    searchContextFiles: () => [],
    attachments: {
      dropTarget: () => document.getElementById("oc-agent") ?? undefined,
      picker: platform.openAttachmentPickerDialog,
      directory: () => state.session?.location.directory ?? "",
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
      variant: {
        options: () =>
          adapter.controls().model.status === "ready"
            ? [
                { id: "default", label: language.t("model.variant.default") },
                ...adapter
                  .controls()
                  .model.selection.variant.list()
                  .map((value) => ({ id: value, label: value })),
              ]
            : [],
        current: () => adapter.controls().model.selection.variant.current() ?? "default",
        onSelect: (value) => {
          if (adapter.disabled() || adapter.controls().model.status !== "ready") return
          adapter.controls().model.selection.variant.set(value === "default" ? undefined : value)
        },
        keybind: () => commands.variantKeybind,
      },
      submit: {
        available: () => !adapter.disabled(),
        enabled: () => !adapter.submitting(),
        stopping: () => adapter.working() && !adapter.state.dirty(),
        working: adapter.working,
        queue: options?.queue,
        onSubmit: (submitOptions) => {
          if (!adapter.state.dirty()) {
            if (adapter.working()) adapter.interrupt()
            return
          }
          const queue = options?.queue
          controller.resetHistory()
          adapter.submit({ delivery: (submitOptions?.alternate ? queue?.alternate() : queue?.delivery()) ?? "steer" })
        },
        onStop: adapter.interrupt,
      },
    },
  })

  createEffect(() => {
    if (adapter.disabled() || dialog.active) controller.onDragLeave()
  })

  return {
    ...controller,
    onKeyDown: (event) => commands.onKeyDown(event) || controller.onKeyDown(event),
    get model() {
      return adapter.controls().model
    },
    get agent() {
      return adapter.controls().agent
    },
    disabled: adapter.disabled,
  }
}
