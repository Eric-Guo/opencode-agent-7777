import { For, Show, createMemo } from "solid-js"
import { Markdown } from "@opencode/session-ui/markdown"
import { MarkdownProvider, useMarkdown, type ReadMarkdownImage } from "@opencode/session-ui/context/markdown"
import { artifactMime } from "@opencode/util/artifact"
import type { SessionDocument } from "@opencode/session-ui/document"
import { useLanguage } from "../runtime/i18n/language"
import { useSettings } from "../settings/model"
import { CompactMessageTimeline } from "../session/timeline/message-timeline-compact"
import { RoundHistory } from "./activity"
import { chatPath, Disclosure } from "./detail-read"
import { AnswerFiles, AnswerReview } from "./output-files"
import type { ChatController } from "./controller"

export function ChatTranscript(p: {
  chat: ChatController
  document: SessionDocument
  onPointerGesture: (target?: EventTarget | null) => void
}) {
  const c = p.chat,
    lang = useLanguage()
  const settings = useSettings()
  const markdown = useMarkdown()
  // Keep the shared timeline renderer, with a local output shelf for each durable answer.
  // Use the bounded document as the source so pending messages cannot push us past nine.
  const groups = createMemo(() => {
    const map = new Map<string, SessionDocument["messages"]>()
    for (const m of p.document.messages) {
      const key = m.type === "user" && m.id.endsWith("-prompt") ? m.id.slice(0, -7) : m.id
      const group = map.get(key) ?? []
      group.push(m)
      map.set(key, group)
    }
    return map
  })
  return (
    <div class="mx-auto w-full max-w-[1000px] self-start">
      <For each={[...groups().keys()]}>
        {(id) => {
          const messages = () => groups().get(id) ?? []
          const turn = () => c.s.snapshot.turns.find((t) => t.id === id)
          const readImage = createMemo<ReadMarkdownImage | undefined>(() => {
            const scope = c.s.connection?.scope
            const variant = turn()?.variant
            if (!scope || !c.s.id || !variant || turn()?.status !== "completed" || !turn()?.files || turn()?.kind)
              return
            const base = chatPath(c, "bytes", { turn: id, variant })
            return async (path, signal) => {
              const type = artifactMime(path)
              if (!type?.startsWith("image/")) return
              const response = await fetch("/api/7777" + base + "&" + new URLSearchParams({ image: path }), {
                headers: { "x-7777-scope": encodeURIComponent(scope) },
                signal,
              })
              if (response.status === 404 || response.status === 409) return
              if (!response.ok) throw new Error(response.statusText)
              const blob = await response.blob()
              if (blob.size <= 10 * 1024 * 1024) return blob.slice(0, blob.size, type)
            }
          })
          const pending = () => c.s.snapshot.pending.find((i) => i.id === id && i.delivery)
          const active = () =>
            c.s.snapshot.detail?.active === id || turn()?.status === "running" || turn()?.status === "pending"
          return (
            <article class="chat-turn">
              <Show when={turn()?.receipt}>
                {(receipt) => (
                  <Disclosure title={lang.t("chat.background")}>
                    <Markdown text={receipt()} />
                  </Disclosure>
                )}
              </Show>
              <Show
                when={turn()?.kind}
                fallback={
                  <MarkdownProvider readImage={readImage()} openLocalFile={markdown?.openLocalFile}>
                    <CompactMessageTimeline
                      document={{
                        sessionID: p.document.sessionID,
                        messages: messages(),
                        diffs: [],
                        status: active() ? { type: "busy" } : { type: "idle" },
                      }}
                      showReasoningSummaries
                      onPointerGesture={p.onPointerGesture}
                    />
                  </MarkdownProvider>
                }
              >
                {(kind) => (
                  <Disclosure title={lang.t(`chat.${kind()}`)}>
                    <Markdown text={turn()?.text || ""} />
                  </Disclosure>
                )}
              </Show>
              <Show when={pending()}>
                {(input) => (
                  <small>
                    {lang.t(
                      input().delivery === "queue"
                        ? "chat.queue"
                        : input().delivery === "steer_now"
                          ? "chat.steer_now"
                          : "chat.steer",
                    )}
                    {input().state === "held" || input().state === "blocked" ? " · " + lang.t("chat.waiting") : ""}
                  </small>
                )}
              </Show>
              <Show when={turn()?.variant} keyed>
                {(variant) => {
                  const query = { turn: id, variant }
                  return (
                    <div class="chat-output">
                      <Show when={!active() && !turn()?.text && !turn()?.kind}>
                        <small>{lang.t("chat.emptyReply", { status: turn()?.status || "" })}</small>
                      </Show>
                      <Show when={turn()?.pruned}>
                        <small>{lang.t("chat.pruned")}</small>
                      </Show>
                      <Show when={turn()?.files}>
                        <AnswerFiles chat={c} query={query} />
                      </Show>
                      <Show when={turn()?.review && !turn()?.pruned}>
                        <AnswerReview
                          chat={c}
                          query={query}
                          valid={() => turn()?.variant === variant}
                          inline={turn()?.status === "completed" && settings.general.showTurnDiffs()}
                        />
                      </Show>
                      <Show when={turn()?.run && !turn()?.pruned && !turn()?.kind}>
                        <Disclosure title={lang.t("chat.rounds")}>
                          <RoundHistory chat={c} run={turn()!.run!} />
                        </Disclosure>
                      </Show>
                    </div>
                  )
                }}
              </Show>
            </article>
          )
        }}
      </For>
    </div>
  )
}
