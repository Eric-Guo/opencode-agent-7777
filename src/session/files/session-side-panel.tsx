import { Show, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode/ui/icon"
import { Spinner } from "@opencode/ui/spinner"
import "./session-side-panel.css"
import { useLanguage } from "@/runtime/i18n/language"
import { createFileModel, type FileModel } from "@/workspaces/files/model"
import { createClientForServer, type OpencodeClient } from "@/runtime/server/client-compact"
import { state } from "@/runtime/server/session-store-compact"
import FileTreeV2 from "./file-tree-v2"
import { useOpenInApp } from "./open-in-app"
import { OpenInAppButton } from "./open-in-app-button"

export type SessionFiles = {
  file: FileModel
  client: () => OpencodeClient | undefined
  openIn: ReturnType<typeof useOpenInApp>
  view: { active?: string; error: string }
  select: (path?: string) => void
  refresh: () => Promise<void[]>
}

export function createSessionFiles(): SessionFiles {
  const [view, setView] = createStore({ active: undefined as string | undefined, error: "" })
  const directory = () => state.session?.location.directory ?? ""
  const client = createMemo<OpencodeClient | undefined>(() =>
    state.server ? createClientForServer({ server: state.server }) : undefined,
  )
  const file = createFileModel({ directory, client, onError: (error) => setView("error", error) })
  const openIn = useOpenInApp({ serverUrl: () => state.server?.url ?? "", onError: (error) => setView("error", error) })
  createEffect(() => {
    directory()
    client()
    setView({ active: undefined, error: "" })
  })
  return {
    file,
    client,
    openIn,
    view,
    select: (path?: string) => setView("active", path),
    refresh: () => {
      setView("error", "")
      return file.tree.refresh()
    },
  }
}

export function SessionSidePanel(props: { model: SessionFiles }) {
  const language = useLanguage()
  const [filter, setFilter] = createStore({ query: "", files: [] as string[], loading: false, error: "", revision: 0 })
  const model = props.model
  const directory = model.file.directory
  createEffect(() => {
    filter.revision
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
    <aside class="session-file-panel" aria-label={language.t("files.title")} data-slot="session-file-tree">
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
              active={model.view.active}
              allowed={filter.query.trim() ? filter.files : undefined}
              onFileClick={(node) => model.select(node.path)}
              onFileDoubleClick={(node) => model.select(node.path)}
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
    </aside>
  )
}
