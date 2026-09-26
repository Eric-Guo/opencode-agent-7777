import { File } from "@opencode/session-ui/file"
import { Button } from "@opencode/ui/button"
import { Spinner } from "@opencode/ui/spinner"
import { Match, Show, Switch, createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { OpenInAppButton } from "./open-in-app-button"
import { resolveOpenInAppPath } from "./open-in-app-path"
import type { SessionFiles } from "./session-side-panel"

export function SessionFileView(props: {
  model: SessionFiles
  path: string
  onAdd: (path: string) => void
  disabled: boolean
}) {
  const language = useLanguage()
  const [preview, setPreview] = createStore({ loading: true, text: "", url: "", mime: "", binary: false, error: "" })
  createEffect(() => {
    props.model.view.revision
    const client = props.model.client()
    const directory = props.model.file.directory()
    const path = props.path
    if (!client || !directory) return
    const abort = new AbortController()
    let url = ""
    setPreview({ loading: true, text: "", url: "", mime: "", binary: false, error: "" })
    void client.file
      .read({ path, location: { directory } }, { signal: abort.signal })
      .then((bytes) => {
        if (abort.signal.aborted) return
        const extension = path.split(".").at(-1)?.toLowerCase() ?? ""
        const mime =
          (
            {
              png: "image/png",
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              gif: "image/gif",
              webp: "image/webp",
              svg: "image/svg+xml",
              pdf: "application/pdf",
            } as Record<string, string>
          )[extension] ?? ""
        if (mime && bytes.length <= 25 * 1024 * 1024) {
          url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }))
          setPreview({ loading: false, url, mime })
          return
        }
        const binary = bytes.length > 1024 * 1024 || bytes.subarray(0, 8192).includes(0)
        setPreview({ loading: false, binary, text: binary ? "" : new TextDecoder().decode(bytes) })
      })
      .catch((error) => {
        if (!abort.signal.aborted) setPreview({ loading: false, error: String(error) })
      })
    onCleanup(() => {
      abort.abort()
      if (url) URL.revokeObjectURL(url)
    })
  })

  return (
    <section
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label={props.path}
      data-slot="session-file-preview"
    >
      <div class="file-panel-toolbar border-b border-v2-border-border-muted px-4 py-2">
        <Button variant="ghost" size="small" onClick={() => props.model.select()}>
          {language.t("files.back")}
        </Button>
        <span class="min-w-0 flex-1 truncate" title={props.path}>
          {props.path}
        </span>
        <Button variant="ghost" size="small" disabled={props.disabled} onClick={() => props.onAdd(props.path)}>
          {language.t("files.addToPrompt")}
        </Button>
        <OpenInAppButton
          state={props.model.openIn}
          path={() => resolveOpenInAppPath(props.model.file.directory(), props.path)}
        />
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <Switch>
          <Match when={preview.loading}>
            <div class="file-panel-status" role="status">
              <Spinner class="size-4" />
              {language.t("files.loading")}
            </div>
          </Match>
          <Match when={preview.error}>
            <div class="file-panel-status" role="alert">
              {language.t("files.loadFailed")}: {preview.error}
            </div>
          </Match>
          <Match when={preview.binary}>
            <div class="file-panel-status">{language.t("files.previewUnavailable")}</div>
          </Match>
          <Match when={preview.url}>
            <Show
              when={preview.mime === "application/pdf"}
              fallback={
                <img class="mx-auto max-h-full max-w-full object-contain p-4" src={preview.url} alt={props.path} />
              }
            >
              <iframe class="h-full min-h-[400px] w-full border-0" src={preview.url} title={props.path} />
            </Show>
          </Match>
          <Match when={!preview.loading}>
            <File mode="text" file={{ name: props.path, contents: preview.text }} />
          </Match>
        </Switch>
      </div>
    </section>
  )
}
