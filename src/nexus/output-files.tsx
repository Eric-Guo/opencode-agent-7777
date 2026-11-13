import { For, Show, lazy, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Markdown } from "@opencode/session-ui/markdown"
import { useLanguage } from "../runtime/i18n/language"
import { request, type ChatController } from "./controller"
import type { OutputFile, Review } from "./inspection"
import { chatPath, DetailRead } from "./detail-read"

const RecordedReview = lazy(() =>
  import("@opencode/session-ui/session-review").then((m) => ({ default: m.SessionReview })),
)
const images: Record<string, string> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  gif: "gif",
  webp: "webp",
  avif: "avif",
  svg: "svg+xml",
  ico: "x-icon",
}

export function FileRow(p: { chat: ChatController; query: Record<string, string>; file: OutputFile }) {
  const lang = useLanguage()
  const [s, set] = createStore({ busy: false, error: "", image: "", markdown: undefined as string | undefined })
  const abort = new AbortController()
  let objectURL = ""
  const clear = () => {
    if (objectURL) URL.revokeObjectURL(objectURL)
    objectURL = ""
    set({ image: "", markdown: undefined })
  }
  onCleanup(() => {
    abort.abort()
    if (objectURL) URL.revokeObjectURL(objectURL)
  })
  const ext = () => p.file.name.split(".").at(-1)?.toLowerCase() ?? ""
  async function open(download: boolean) {
    if (s.busy) return
    clear()
    set({ busy: true, error: "" })
    try {
      const scope = p.chat.s.connection!.scope
      const res = await fetch("/api/7777" + chatPath(p.chat, "bytes", { ...p.query, file: p.file.id }), {
        headers: { "x-7777-scope": encodeURIComponent(scope) },
        signal: abort.signal,
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const blob = await res.blob()
      if (abort.signal.aborted) return
      if (!download && blob.size > 10 * 1024 * 1024) throw new Error(lang.t("chat.previewTooLarge"))
      if (download) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = p.file.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else if (images[ext()]) {
        objectURL = URL.createObjectURL(blob.slice(0, blob.size, "image/" + images[ext()]))
        set("image", objectURL)
      } else {
        const value = await blob.text()
        if (!abort.signal.aborted) set("markdown", value)
      }
    } catch (e) {
      if (!abort.signal.aborted) set("error", e instanceof Error ? e.message : lang.t("chat.attachError"))
    } finally {
      if (!abort.signal.aborted) set("busy", false)
    }
  }
  return (
    <div class="chat-file">
      <div class="chat-row">
        <strong>{p.file.name}</strong>
        <Show when={images[ext()] || ["md", "markdown"].includes(ext())}>
          <Button disabled={s.busy} onClick={() => (s.image || s.markdown !== undefined ? clear() : void open(false))}>
            {lang.t(s.image || s.markdown !== undefined ? "chat.closePreview" : "chat.preview")}
          </Button>
        </Show>
        <Button disabled={s.busy} onClick={() => void open(true)}>
          {lang.t("chat.download")}
        </Button>
      </div>
      <Show when={s.error}>
        <p role="alert">{s.error}</p>
      </Show>
      <Show when={s.image}>
        <img class="max-h-96 max-w-full" src={s.image} alt={p.file.name} />
      </Show>
      <Show when={s.markdown !== undefined}>
        <Markdown text={s.markdown!} />
      </Show>
    </div>
  )
}

export function AnswerFiles(p: { chat: ChatController; query: Record<string, string> }) {
  return (
    <DetailRead<OutputFile[]> chat={p.chat} path={chatPath(p.chat, "files", p.query)}>
      {(files) => <For each={files()}>{(f) => <FileRow chat={p.chat} query={p.query} file={f} />}</For>}
    </DetailRead>
  )
}

export function AnswerReview(p: { chat: ChatController; query: Record<string, string>; valid: Accessor<boolean> }) {
  const lang = useLanguage()
  const [s, set] = createStore({ open: false, notice: "", restoring: false })
  const receipts = new Map<string, string>()
  return (
    <details class="chat-disclosure" onToggle={(e) => set("open", e.currentTarget.open)}>
      <summary>{lang.t("chat.review")}</summary>
      <Show when={s.open}>
        <DetailRead<Review[]> chat={p.chat} path={chatPath(p.chat, "review", p.query)}>
          {(reviews) => (
            <For each={reviews()} fallback={<p>{lang.t("review.empty")}</p>}>
              {(r) => (
                <section>
                  <p>{lang.t("chat.scopedReview", { runner: r.runner, root: r.root })}</p>
                  <Show when={r.restorable && p.chat.writable()}>
                    <Button
                      type="button"
                      disabled={s.restoring || !p.valid()}
                      onClick={async () => {
                        if (!p.valid() || !p.chat.writable()) return
                        set({ restoring: true, notice: "" })
                        const key = JSON.stringify([r.run, r.base])
                        const receipt = receipts.get(key) ?? crypto.randomUUID()
                        receipts.set(key, receipt)
                        try {
                          await request(chatPath(p.chat, "restore-files", p.query), p.chat.s.connection?.scope, {
                            task: r.base,
                            receipt,
                          })
                          receipts.delete(key)
                          set("notice", lang.t("chat.filesRestored"))
                        } catch (error) {
                          set("notice", error instanceof Error ? error.message : String(error))
                        } finally {
                          set("restoring", false)
                        }
                      }}
                    >
                      {lang.t("chat.restoreFiles")}
                    </Button>
                  </Show>
                  <Show when={r.truncated}>{lang.t("chat.limit")}</Show>
                  <For each={r.files.filter((f) => f.state !== "text")}>
                    {(f) => <p>{lang.t("chat.nonText", { path: f.path, state: f.state })}</p>}
                  </For>
                  <RecordedReview
                    diffStyle="unified"
                    diffs={r.files
                      .filter((f) => f.state === "text")
                      .map((f) => ({
                        file: f.path,
                        patch: f.patch,
                        additions: f.additions ?? 0,
                        deletions: f.deletions ?? 0,
                      }))}
                    onLineComment={
                      p.chat.writable()
                        ? (comment) => {
                            if (!p.valid() || !p.chat.writable() || p.chat.s.sending) return
                            const note = JSON.stringify(
                              {
                                runner: r.runner,
                                root: r.root,
                                base: r.base,
                                run: r.run,
                                ...p.query,
                                path: comment.file,
                                side: comment.selection.side === "deletions" ? "left" : "right",
                                line: comment.selection.start,
                                end: comment.selection.end,
                                excerpt: comment.preview,
                                text: comment.comment,
                              },
                              null,
                              2,
                            )
                            p.chat.edit(
                              [p.chat.s.draft, lang.t("chat.reviewNote") + "\n" + note].filter(Boolean).join("\n\n"),
                            )
                            set("notice", lang.t("chat.added"))
                          }
                        : undefined
                    }
                  />
                </section>
              )}
            </For>
          )}
        </DetailRead>
      </Show>
      <span role="status">{s.notice}</span>
    </details>
  )
}
