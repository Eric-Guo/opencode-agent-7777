import { useDialog } from "@opencode/ui/context/dialog"
import { Skill } from "@opencode/schema/skill"
import { createEffect, createMemo, onCleanup } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { createPersistedBlobReference } from "@/runtime/persistence/drafts"
import { createPlatformAttachments } from "@/runtime/platform/platform-bridge"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { createFileSearch } from "@/workspaces/files/model"
import { fileUrl } from "@/workspaces/files/path"
import type { ComposerAdapter, ComposerControls, ComposerQueue } from "./adapter"
import { createComposerCatalog } from "./catalog-compact"
import { parseSlashCommand } from "./client-slash-command"
import { useComposerCommands } from "./commands"
import { createComposerEditor, type ComposerEditorModel } from "./editor/interaction"
import { composerHistory } from "./history/store"
import type { ComposerSuggestion } from "./types"

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
      const directory = state.session ? sessionDirectory(state.session) : undefined
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
    if (!active) {
      catalog.clear()
      return
    }
    void catalog.load(createDirectorySdk(active.server, active.directory).client, active.directory)
  })
  onCleanup(catalog.clear)
  onCleanup(files.clear)
  const slashCommands = createMemo<ComposerSuggestion[]>(() =>
    catalog.state.commands.map((command) => ({
      id: `custom.${command.name}`,
      kind: "command",
      label: `/${command.name}`,
      trigger: command.name,
      title: command.name,
      description: command.description,
    })),
  )
  const context = createMemo<ComposerSuggestion[]>(() => [
    ...catalog.state.skills.map((skill) => ({
      id: `skill:${skill.id}`,
      kind: "skill" as const,
      label: `@${skill.id}`,
      description: skill.description,
      mention: {
        type: "skill" as const,
        id: Skill.ID.make(skill.id),
        name: Skill.Name.make(skill.name),
        content: `@${skill.id}`,
        start: 0,
        end: 0,
      },
    })),
    ...catalog.state.agents
      .filter((agent) => !agent.hidden && agent.mode !== "primary")
      .map((agent) => ({
        id: `agent:${agent.name}`,
        kind: "agent" as const,
        label: `@${agent.name}`,
        description: agent.description,
        mention: { type: "agent" as const, name: agent.name, content: `@${agent.name}`, start: 0, end: 0 },
      })),
  ])
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
    context,
    searchContextFiles: async (query) => {
      const active = location()
      if (!active) return []
      return (await files.searchFilesAndDirectories(query)).map((path) => ({
        id: `file:${path}`,
        kind: "file",
        label: path,
        path,
        // Pin the original directory so the single draft and cross-session history keep the selected file.
        mention: { type: "file", path, url: fileUrl(active.directory, path), content: `@${path}`, start: 0, end: 0 },
      }))
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
