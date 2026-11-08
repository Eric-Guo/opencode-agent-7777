import { useDialog } from "@opencode/ui/context/dialog"
import { ImagePreview } from "@opencode/ui/image-preview"
import { createComponent, createEffect, createMemo, onCleanup } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { createPersistedBlobReference } from "@/runtime/persistence/drafts"
import { createPlatformAttachments } from "@/runtime/platform/platform-bridge"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { currentData, currentDirectory, state } from "@/runtime/server/session-store-compact"
import { createFileSearch } from "@/workspaces/files/model"
import type { ComposerAdapter, ComposerControls, ComposerQueue } from "./adapter"
import { createComposerCatalog } from "./catalog-compact"
import { createClientSlashCommands, parseSlashCommand } from "./client-slash-command"
import { useComposerCommands } from "./commands"
import { createComposerEditor, type ComposerEditorModel } from "./editor/interaction"
import { composerHistory } from "./history/store"
import { commandSuggestions, contextSuggestions, fileSuggestions } from "./suggestions/catalog-compact"

export type ComposerModel = ComposerEditorModel & {
  readonly model: ComposerControls["model"]
  readonly agent: string
  disabled: ComposerAdapter["disabled"]
  suggestionStatus: () => "loading" | "ready" | "failed"
}

export function createComposerModel(adapter: ComposerAdapter, options?: { queue?: ComposerQueue }): ComposerModel {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = createPlatformAttachments()
  const catalog = createComposerCatalog()
  const location = createMemo(
    () => {
      const server = state.server
      const directory = currentDirectory()
      return server && directory ? { server, directory } : undefined
    },
    undefined,
    { equals: (left, right) => left?.server === right?.server && left?.directory === right?.directory },
  )
  const files = createFileSearch(() => {
    const active = location()
    return active
      ? { client: createDirectorySdk(active.server, active.directory).client, directory: active.directory }
      : undefined
  })
  createEffect(() => {
    const active = location()
    const data = currentData()
    if (!active || !data) {
      catalog.clear()
      return
    }
    void catalog.load(data, active.directory)
  })
  onCleanup(files.clear)
  const clientCommands = () => adapter.commands?.() ?? []
  const localCommands = createClientSlashCommands({
    commands: clientCommands,
    draft: adapter.state,
    beforeSelect: () => {
      controller.resetHistory()
      controller.restoreFocus()
    },
    onArguments: (command) => adapter.onAttachmentError(language.t("prompt.command.noArguments", { command })),
  })
  const slashCommands = createMemo(() => commandSuggestions(catalog.state.commands, localCommands.suggestions()))
  const context = createMemo(() => contextSuggestions(catalog.state.skills, catalog.state.agents))
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
      commands: true,
      context: true,
      shell: false,
    },
    commands: slashCommands,
    onSuggestionSelect: (item) => {
      if (adapter.disabled()) return
      return localCommands.select(item.id)
    },
    context,
    searchContextFiles: async (query) => {
      const active = location()
      if (!active) return []
      return fileSuggestions(await files.searchFilesAndDirectories(query), active.directory)
    },
    openAttachment: (attachment) => {
      // Compact attachments include PDFs/text under the same part type; only images have a preview.
      if (!attachment.mime.startsWith("image/")) return
      const { url: src } = attachment.blob
      const alt = attachment.filename
      void dialog.show(() => createComponent(ImagePreview, { src, alt }))
    },
    attachments: {
      dropTarget: () => document.getElementById("oc-agent") ?? undefined,
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
          const parsed = parseSlashCommand(adapter.state.current().trim())
          if (localCommands.submit(adapter.state.current())) return
          const command = catalog.state.commands.find((item) => item.name === parsed?.name)?.name
          if (parsed && catalog.state.commandStatus === "loading") return
          controller.resetHistory()
          adapter.submit({
            delivery: (submitOptions?.alternate ? queue?.alternate() : queue?.delivery()) ?? "steer",
            ...(command ? { command } : {}),
          })
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
    suggestionStatus: () => {
      const popover = controller.state.popover
      if (popover.type !== "context") return catalog.state.commandStatus
      const statuses = [
        catalog.state.skillStatus,
        catalog.state.agentStatus,
        ...(popover.query.trim() ? [files.state.status] : []),
      ]
      if (statuses.includes("loading")) return "loading"
      return statuses.includes("failed") ? "failed" : "ready"
    },
  }
}
