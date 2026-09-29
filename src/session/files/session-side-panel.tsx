import { For, Show, createEffect, createMemo, onCleanup, onMount, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode/ui/icon"
import { Spinner } from "@opencode/ui/spinner"
import { ResizeHandle } from "@opencode/ui/resize-handle"
import { Tabs } from "@opencode/ui/tabs"
import { createEventListener } from "@solid-primitives/event-listener"
import { DragDropProvider, PointerSensor } from "@dnd-kit/solid"
import { isSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToHorizontalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import "./session-side-panel.css"
import { useLanguage } from "@/runtime/i18n/language"
import { createFileModel, type FileModel } from "@/workspaces/files/model"
import { createClientForServer, type OpencodeClient } from "@/runtime/server/client-compact"
import { state } from "@/runtime/server/session-store-compact"
import { sessionEvents } from "@/runtime/server/sync-session-compact"
import { readFileTreeWidth, writeFileTreeWidth } from "@/runtime/persistence/settings-storage-compact"
import {
  closeSessionTab,
  moveSessionTab,
  openSessionTab,
  previewSessionTab,
  type SessionTabState,
} from "@/shell/state/session-tabs"
import FileTreeV2 from "./file-tree-v2"
import { useOpenInApp } from "./open-in-app"
import { OpenInAppButton } from "./open-in-app-button"
import { SessionFileView } from "./file-tabs"
import { SortableTab } from "./tab"
import { createFileTabListSync } from "./file-tab-scroll"

export type SessionFiles = {
  file: FileModel
  client: () => OpencodeClient | undefined
  openIn: ReturnType<typeof useOpenInApp>
  view: SessionTabState & { error: string; revision: number }
  select: (path?: string) => void
  preview: (path: string) => void
  open: (path: string) => void
  close: (path: string) => void
  move: (path: string, to: number) => void
  refresh: () => Promise<void[]>
}

export function createSessionFiles(): SessionFiles {
  const [view, setView] = createStore<SessionFiles["view"]>({ tabs: { all: [] }, error: "", revision: 0 })
  const directory = () => state.session?.location.directory ?? ""
  const client = createMemo<OpencodeClient | undefined>(() =>
    state.server ? createClientForServer({ server: state.server }) : undefined,
  )
  const file = createFileModel({
    directory,
    client,
    events: sessionEvents,
    onError: (error) => setView("error", error),
    onChange: (path) => {
      const active = view.tabs.active
      if (!path || active === path || active?.startsWith(path + "/")) setView("revision", (value) => value + 1)
    },
  })
  const openIn = useOpenInApp({ serverUrl: () => state.server?.url ?? "", onError: (error) => setView("error", error) })
  createEffect(() => {
    directory()
    client()
    setView({ tabs: { all: [], active: undefined }, preview: undefined, error: "" })
  })
  return {
    file,
    client,
    openIn,
    view,
    select: (path?: string) => {
      if (path && !view.tabs.all.includes(path)) return
      setView("tabs", "active", path)
    },
    preview: (path) => setView(previewSessionTab(view, path)),
    open: (path) => setView(openSessionTab(view, path)),
    close: (path) => setView(closeSessionTab(view, path)),
    move: (path, to) => setView(moveSessionTab(view, path, to)),
    refresh: () => {
      setView("error", "")
      return file.tree.refresh()
    },
  }
}

export function SessionSidePanel(props: { model: SessionFiles }) {
  const language = useLanguage()
  const [size, setSize] = createStore({ width: readFileTreeWidth(), available: 0 })
  let panel!: HTMLElement
  const minWidth = () => (size.available && size.available <= 720 ? 150 : 240)
  const maxWidth = () => Math.max(minWidth(), Math.min(480, (size.available || 960) - 368))
  const width = () => Math.min(maxWidth(), Math.max(minWidth(), size.width))
  const resize = (value: number) => {
    const next = Math.min(maxWidth(), Math.max(minWidth(), value))
    setSize("width", next)
    writeFileTreeWidth(next)
  }
  onMount(() => {
    const workspace = panel.parentElement!
    const observer = new ResizeObserver(() => setSize("available", workspace.clientWidth))
    setSize("available", workspace.clientWidth)
    observer.observe(workspace)
    onCleanup(() => observer.disconnect())
  })
  const [filter, setFilter] = createStore({ query: "", files: [] as string[], loading: false, error: "", revision: 0 })
  const model = props.model
  const directory = model.file.directory
  createEffect(() => {
    filter.revision
    model.file.revision()
    const root = directory()
    const query = filter.query.trim()
    const client = model.client()
    setFilter({ files: [], loading: !!query && !!root, error: "" })
    if (!query || !client || !root) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void client.file
        .find({ location: { directory: root }, query, type: "file", limit: 200 }, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setFilter({ files: result.data.map((entry) => entry.path), loading: false })
        })
        .catch((error) => {
          if (!controller.signal.aborted) setFilter({ loading: false, error: String(error) })
        })
    }, 150)
    onCleanup(() => {
      clearTimeout(timer)
      controller.abort()
    })
  })

  return (
    <aside
      ref={panel}
      class="session-file-panel"
      style={{ width: `${width()}px` }}
      aria-label={language.t("files.title")}
      data-slot="session-file-tree"
    >
      <div class="file-panel-toolbar">
        <Icon name="file-tree" size="small" />
        <span class="min-w-0 flex-1 truncate" title={directory()}>
          {directory().split(/[\\/]/).filter(Boolean).at(-1) || language.t("files.title")}
        </span>
        <button
          type="button"
          class="file-panel-icon-button"
          aria-label={language.t("files.refresh")}
          disabled={!directory()}
          onClick={() => {
            void model.refresh()
            setFilter("revision", (value) => value + 1)
          }}
        >
          <Icon name="refresh" size="small" />
        </button>
        <OpenInAppButton state={model.openIn} path={directory} />
      </div>
      <input
        class="file-panel-filter"
        aria-label={language.t("files.filter")}
        placeholder={language.t("files.filter")}
        value={filter.query}
        onInput={(event) => setFilter("query", event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setFilter("query", "")
        }}
      />
      <div class="scroll-view__viewport file-panel-scroll">
        <Show when={!filter.query.trim() && model.file.tree.state("")?.loading}>
          <div class="file-panel-status" role="status">
            <Spinner class="size-4" />
            {language.t("files.loading")}
          </div>
        </Show>
        <Show
          when={directory()}
          fallback={
            <div class="file-panel-status" role="status">
              {language.t("files.loading")}
            </div>
          }
        >
          <Show
            when={!filter.loading}
            fallback={
              <div class="file-panel-status" role="status">
                <Spinner class="size-4" />
                {language.t("files.loading")}
              </div>
            }
          >
            <FileTreeV2
              file={model.file}
              openIn={model.openIn}
              active={model.view.tabs.active}
              allowed={filter.query.trim() ? filter.files : undefined}
              onFileClick={(node) => model.preview(node.path)}
              onFileDoubleClick={(node) => model.open(node.path)}
            />
            <Show
              when={
                filter.query.trim()
                  ? !filter.files.length && !filter.error
                  : model.file.tree.state("")?.loaded && !model.file.tree.children("").length
              }
            >
              <div class="file-panel-status" role="status">
                {language.t(filter.query.trim() ? "files.noResults" : "files.empty")}
              </div>
            </Show>
          </Show>
        </Show>
        <Show when={filter.error || model.file.tree.state("")?.error || model.view.error}>
          {(error) => (
            <div class="file-panel-status" role="alert">
              {error()}
              <button
                type="button"
                onClick={() => {
                  void model.refresh()
                  setFilter("revision", (value) => value + 1)
                }}
              >
                {language.t("files.retry")}
              </button>
            </div>
          )}
        </Show>
      </div>
      <ResizeHandle
        direction="horizontal"
        edge="end"
        size={width()}
        min={minWidth()}
        max={maxWidth()}
        onResize={resize}
        role="separator"
        tabIndex={0}
        aria-label={language.t("files.resize")}
        aria-orientation="vertical"
        aria-valuemin={minWidth()}
        aria-valuemax={maxWidth()}
        aria-valuenow={width()}
        onKeyDown={(event) => {
          const value = { ArrowLeft: width() - 16, ArrowRight: width() + 16, Home: minWidth(), End: maxWidth() }[
            event.key
          ]
          if (value === undefined) return
          event.preventDefault()
          resize(value)
        }}
      />
    </aside>
  )
}

// File paths are nonempty; the empty value belongs to the conversation.
export function SessionFileTabs(
  props: ParentProps<{
    model?: SessionFiles
    onAdd: (path: string) => void
    disabled: boolean
  }>,
) {
  const language = useLanguage()
  let root: HTMLDivElement | undefined
  let tabList: HTMLDivElement | undefined
  let syncTabList: (() => void) | undefined
  let selectionEvent: Event | undefined
  let drag: { client: ReturnType<SessionFiles["client"]>; directory: string; tabs: string[] } | undefined
  const close = (path: string) => {
    props.model?.close(path)
    queueMicrotask(() => {
      if (root?.isConnected)
        root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"], [role="tabpanel"]')?.focus()
    })
  }
  createEffect(() => {
    props.model?.view.tabs.active
    props.model?.view.tabs.all.length
    const frame = requestAnimationFrame(() => {
      syncTabList?.()
    })
    onCleanup(() => cancelAnimationFrame(frame))
  })
  return (
    <Show when={props.model} fallback={props.children}>
      {(model) => (
        <DragDropProvider
          sensors={[
            PointerSensor.configure({
              activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
              preventActivation: (event) =>
                event.target instanceof Element && !!event.target.closest('[data-slot="tabs-v2-trigger-close-button"]'),
            }),
          ]}
          modifiers={[RestrictToHorizontalAxis, RestrictToElement.configure({ element: () => tabList ?? null })]}
          plugins={(defaults) => [
            ...defaults.filter((plugin) => plugin !== Accessibility),
            AutoScroller.configure({ acceleration: 8, threshold: { x: 0.05, y: 0 } }),
            Feedback.configure({ dropAnimation: null }),
          ]}
          onDragStart={() => {
            drag = { client: model().client(), directory: model().file.directory(), tabs: [...model().view.tabs.all] }
          }}
          onDragEnd={(event) => {
            const start = drag
            drag = undefined
            syncTabList?.()
            const source = event.operation.source
            if (event.canceled || !isSortable(source) || source.initialIndex === source.index || !start) return
            // Ignore drops from a previous workspace or a changed set of open tabs.
            if (start.client !== model().client() || start.directory !== model().file.directory()) return
            const tabs = model().view.tabs.all
            if (tabs.length !== start.tabs.length || tabs.some((path, index) => path !== start.tabs[index])) return
            model().move(source.id.toString(), source.index)
          }}
        >
          <Tabs
            ref={root}
            variant="line"
            class="session-file-tabs"
            value={model().view.tabs.active ?? ""}
            onChange={(path) => {
              // Like the main app, ignore Kobalte's fallback while new triggers register.
              // Only input events select a tab; the local state owns open/close selection.
              if (selectionEvent && selectionEvent.eventPhase !== Event.NONE) model().select(path || undefined)
            }}
          >
            <Show when={model().view.tabs.all.length}>
              <Tabs.List
                aria-label={language.t("files.tabs")}
                ref={(element: HTMLDivElement) => {
                  tabList = element
                  createEventListener(
                    element,
                    ["pointerdown", "click", "keydown"],
                    (event) => (selectionEvent = event),
                    {
                      capture: true,
                    },
                  )
                  const sync = createFileTabListSync({ el: element, dragging: () => !!drag })
                  syncTabList = sync.schedule
                  onCleanup(() => {
                    sync.dispose()
                    tabList = undefined
                    syncTabList = undefined
                  })
                }}
              >
                <Tabs.Trigger value="">{language.t("files.conversation")}</Tabs.Trigger>
                <For each={model().view.tabs.all}>
                  {(path, index) => (
                    <SortableTab
                      path={path}
                      index={index()}
                      temporary={model().view.preview === path}
                      onClose={() => close(path)}
                      onKeep={() => model().open(path)}
                      onMove={(to) => model().move(path, to)}
                    />
                  )}
                </For>
              </Tabs.List>
            </Show>
            <Tabs.Content
              value=""
              class="session-conversation-tab"
              tabIndex={-1}
              aria-label={language.t("files.conversation")}
            >
              {props.children}
            </Tabs.Content>
            <For each={model().view.tabs.all}>
              {(path) => (
                <Tabs.Content value={path}>
                  <Show when={model().view.tabs.active === path}>
                    <SessionFileView model={model()} path={path} onAdd={props.onAdd} disabled={props.disabled} />
                  </Show>
                </Tabs.Content>
              )}
            </For>
          </Tabs>
        </DragDropProvider>
      )}
    </Show>
  )
}
