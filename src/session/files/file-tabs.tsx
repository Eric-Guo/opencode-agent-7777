import { File } from "@opencode/session-ui/file"
import { Button } from "@opencode/ui/button"
import { Spinner } from "@opencode/ui/spinner"
import { Match, Show, Switch, createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { OfficePreview } from "@/microsoft-office/renderer"
import { useLanguage } from "@/runtime/i18n/language"
import { fileContentFromBytes, type FilePreviewContent } from "@/workspaces/files/artifact"
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
  const [preview, setPreview] = createStore<{
    loading: boolean
    content: FilePreviewContent
    url: string
    error: string
    details: readonly string[]
  }>({ loading: true, content: { kind: "text", text: "" }, url: "", error: "", details: [] })
  let audio: HTMLAudioElement | undefined
  createEffect(() => {
    props.model.view.revision
    const client = props.model.client()
    const directory = props.model.file.directory()
    const path = props.path
    if (!client || !directory) return
    const abort = new AbortController()
    let url = ""
    setPreview({ loading: true, content: { kind: "text", text: "" }, url: "", error: "", details: [] })
    void client.file
      .read({ path, location: { directory } }, { signal: abort.signal })
      .then((bytes) => {
        if (abort.signal.aborted) return
        const content = fileContentFromBytes(path, bytes)
        if (content.kind === "media") {
          url = URL.createObjectURL(new Blob([new Uint8Array(content.bytes)], { type: content.mime }))
        }
        setPreview({ loading: false, content, url })
      })
      .catch((error) => {
        if (!abort.signal.aborted) setPreview({ loading: false, error: String(error) })
      })
    onCleanup(() => {
      abort.abort()
      audio?.pause()
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
        <Show when={preview.details.length}>
          <span class="shrink-0 text-v2-text-text-weak">{preview.details.join(" · ")}</span>
        </Show>
        <Show when={props.model.view.preview === props.path}>
          <Button variant="ghost" size="small" onClick={() => props.model.open(props.path)}>
            {language.t("files.keepOpen")}
          </Button>
        </Show>
        <Button variant="ghost" size="small" disabled={props.disabled} onClick={() => props.onAdd(props.path)}>
          {language.t("files.addToPrompt")}
        </Button>
        <OpenInAppButton
          state={props.model.openIn}
          path={() => resolveOpenInAppPath(props.model.file.directory(), props.path)}
        />
      </div>
      <div class="flex min-h-0 flex-1 flex-col overflow-auto">
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
          <Match when={preview.content.kind === "binary" && preview.content}>
            {(content) => (
              <div class="file-panel-status">
                <Show when={content().problem} fallback={language.t("files.previewUnavailable")}>
                  {(problem) => language.t(`office.problem.${problem()}`)}
                </Show>
              </div>
            )}
          </Match>
          <Match when={preview.content.kind === "office" && preview.content}>
            {(content) => (
              <OfficePreview
                bytes={content().bytes}
                format={content().format}
                onDetails={(details) => setPreview({ details })}
                onError={() => setPreview({ content: { kind: "binary" }, details: [] })}
              />
            )}
          </Match>
          <Match when={preview.url && preview.content.kind === "media" && preview.content.mime === "audio/mpeg"}>
            <div class="flex h-full items-center justify-center p-4">
              <audio
                ref={audio}
                class="w-full max-w-xl"
                controls
                preload="metadata"
                src={preview.url}
                aria-label={props.path}
                onError={() => setPreview({ error: language.t("files.audioPlaybackFailed") })}
              />
            </div>
          </Match>
          <Match when={preview.url}>
            <Show
              when={preview.content.kind === "media" && preview.content.mime === "application/pdf"}
              fallback={
                <img class="mx-auto max-h-full max-w-full object-contain p-4" src={preview.url} alt={props.path} />
              }
            >
              <iframe class="h-full min-h-[400px] w-full border-0" src={preview.url} title={props.path} />
            </Show>
          </Match>
          <Match when={preview.content.kind === "text" && preview.content}>
            {(content) => <File mode="text" file={{ name: props.path, contents: content().text }} />}
          </Match>
        </Switch>
      </div>
    </section>
  )
}
