import { For, Show, createSignal, type JSX } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Markdown } from "@opencode/session-ui/markdown"
import { useLanguage } from "../runtime/i18n/language"
import { chatPath, DetailRead } from "./detail-read"
import { FileRow } from "./output-files"
import type { ChatController } from "./controller"
import type { ChatTurn } from "./chat"
import type { Related, RunView, TaskView, Rounds } from "./inspection"

export function Disclosure(p: { title: JSX.Element; children: JSX.Element }) {
  const [open, set] = createSignal(false)
  return (
    <details class="chat-disclosure" onToggle={(e) => set(e.currentTarget.open)}>
      <summary>{p.title}</summary>
      <Show when={open()}>{p.children}</Show>
    </details>
  )
}
function Task(p: { chat: ChatController; run: string; task: string; name: string }) {
  const lang = useLanguage(),
    q = { run: p.run, key: p.task }
  return (
    <Disclosure title={p.name}>
      <DetailRead<TaskView> chat={p.chat} path={chatPath(p.chat, "task", q)}>
        {(data) => (
          <>
            <p>
              {data().kind} · {data().status}
            </p>
            <Show when={data().prompt}>
              <Markdown text={data().prompt!} />
            </Show>
            <Show when={data().input}>
              <strong>{lang.t("chat.input")}</strong>
              <pre>{JSON.stringify(data().input, null, 2)}</pre>
            </Show>
            <Show when={data().output}>
              <strong>{lang.t("chat.output")}</strong>
              <pre>{data().output}</pre>
            </Show>
            <Show when={data().error}>
              <pre>{JSON.stringify(data().error, null, 2)}</pre>
            </Show>
            <For each={data().captures}>{(file) => <FileRow chat={p.chat} file={file} query={q} />}</For>
            <Show when={data().sealed}>
              <Disclosure title={lang.t("chat.sealed")}>
                <DetailRead<unknown> chat={p.chat} path={chatPath(p.chat, "request", q)}>
                  {(value) => <pre>{JSON.stringify(value(), null, 2)}</pre>}
                </DetailRead>
              </Disclosure>
            </Show>
          </>
        )}
      </DetailRead>
    </Disclosure>
  )
}
export function RoundHistory(p: { chat: ChatController; run: string; before?: string }) {
  const lang = useLanguage()
  return (
    <DetailRead<Rounds>
      chat={p.chat}
      path={chatPath(p.chat, "rounds", { run: p.run, ...(p.before ? { before: p.before } : {}) })}
    >
      {(page) => (
        <>
          <For each={page().rounds} fallback={<p>{lang.t("chat.empty")}</p>}>
            {(row) => (
              <div class="chat-round">
                <Task
                  chat={p.chat}
                  run={p.run}
                  task={row.task_key}
                  name={lang.t("chat.round", { key: row.task_key }) + " · " + row.status}
                />
                <For each={row.calls.items}>
                  {(call) => (
                    <Task chat={p.chat} run={p.run} task={call.task_key} name={call.name + " · " + call.status} />
                  )}
                </For>
              </div>
            )}
          </For>
          <Show when={page().has_older && page().next_before != null}>
            <Disclosure title={lang.t("chat.earlier")}>
              <RoundHistory chat={p.chat} run={p.run} before={String(page().next_before)} />
            </Disclosure>
          </Show>
        </>
      )}
    </DetailRead>
  )
}
function Run(p: { chat: ChatController; run: string }) {
  const lang = useLanguage(),
    c = p.chat
  const act = (action: string, key?: string) => void c.command("execution", { run: p.run, key, action })
  return (
    <DetailRead<RunView> chat={c} revision={c.s.revision} path={chatPath(c, "run", { run: p.run })}>
      {(data) => (
        <>
          <div class="chat-row">
            <strong>{data().status}</strong>
            <Show when={c.writable() && ["running", "paused"].includes(data().status)}>
              <Button disabled={c.s.sending} onClick={() => act(data().status === "paused" ? "resume" : "pause")}>
                {lang.t(data().status === "paused" ? "chat.resume" : "chat.pause")}
              </Button>
            </Show>
          </div>
          <For each={data().tasks.map((t) => t.key)}>
            {(key) => {
              const task = () => data().tasks.find((t) => t.key === key)!
              return (
                <div>
                  <Task chat={c} run={p.run} task={key} name={task().name + " · " + task().status} />
                  <Show when={task().waitingOn.length}>
                    <small>
                      {lang.t("chat.waiting")}: {task().waitingOn.join(", ")}
                    </small>
                  </Show>
                  <Show when={c.writable()}>
                    <div class="chat-row">
                      <Show when={task().unresolved}>
                        <Button disabled={c.s.sending} onClick={() => act("retry", key)}>
                          {lang.t("chat.retry")}
                        </Button>
                        <Button disabled={c.s.sending} onClick={() => act("abandon", key)}>
                          {lang.t("chat.abandon")}
                        </Button>
                      </Show>
                      <Show when={task().branch && !task().terminal}>
                        <Button disabled={c.s.sending} onClick={() => act("cancel", key)}>
                          {lang.t("chat.branch")}
                        </Button>
                      </Show>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
        </>
      )}
    </DetailRead>
  )
}
function RelatedPage(p: { chat: ChatController; kind: "children" | "links"; after?: string }) {
  const lang = useLanguage(),
    c = p.chat
  return (
    <DetailRead<Related> chat={c} revision={c.s.revision} path={chatPath(c, p.kind, p.after ? { after: p.after } : {})}>
      {(page) => (
        <>
          <For each={page().items.map((i) => i.id)} fallback={<p>{lang.t("chat.empty")}</p>}>
            {(id) => {
              const item = () => page().items.find((i) => i.id === id)!
              return (
                <div class="chat-row">
                  <Show when={p.kind === "children"} fallback={<span>{item().name}</span>}>
                    <Disclosure title={item().name + " · " + lang.t(item().busy ? "chat.running" : "chat.idle")}>
                      <DetailRead<ChatTurn[]> chat={c} path={chatPath(c, "child", { id })}>
                        {(rows) => (
                          <For each={rows()}>
                            {(turn) => (
                              <section>
                                <strong>{turn.prompt}</strong>
                                <Markdown text={turn.text} />
                              </section>
                            )}
                          </For>
                        )}
                      </DetailRead>
                    </Disclosure>
                  </Show>
                  <Show when={c.writable() && (p.kind === "links" || item().busy)}>
                    <Button
                      disabled={c.s.sending}
                      onClick={() =>
                        void c.command("execution", { action: p.kind === "links" ? "link-close" : "child-stop", id })
                      }
                    >
                      {lang.t(p.kind === "links" ? "chat.closeLink" : "chat.stopChild")}
                    </Button>
                  </Show>
                </div>
              )
            }}
          </For>
          <Show when={page().next}>
            {(next) => (
              <Disclosure title={lang.t("chat.more")}>
                <RelatedPage chat={c} kind={p.kind} after={next()} />
              </Disclosure>
            )}
          </Show>
        </>
      )}
    </DetailRead>
  )
}
export function Activity(p: { chat: ChatController }) {
  const c = p.chat,
    lang = useLanguage()
  return (
    <div class="chat-inspect">
      <DetailRead<{ id: string; status: string }[]> chat={c} revision={c.s.revision} path={chatPath(c, "work")}>
        {(runs) => (
          <>
            <Show when={c.s.snapshot.busy || runs().length}>
              <Button disabled={c.s.sending || !c.s.hydrated} onClick={() => void c.stop()}>
                {lang.t("chat.stopAll")}
              </Button>
            </Show>
            <For each={runs().map((r) => r.id)} fallback={<p>{lang.t("chat.noRun")}</p>}>
              {(id) => (
                <section>
                  <Run chat={c} run={id} />
                </section>
              )}
            </For>
          </>
        )}
      </DetailRead>
      <Disclosure title={lang.t("chat.children")}>
        <RelatedPage chat={c} kind="children" />
      </Disclosure>
      <Disclosure title={lang.t("chat.links")}>
        <RelatedPage chat={c} kind="links" />
      </Disclosure>
      <Show when={c.s.error}>
        <p role="alert">{c.s.error}</p>
      </Show>
    </div>
  )
}
export function Usage(p: { chat: ChatController }) {
  const lang = useLanguage(),
    detail = () => p.chat.s.snapshot.detail,
    usage = () => detail()?.usage,
    context = () => detail()?.context
  const n = (value: number | null | undefined) =>
    value == null ? lang.t("chat.unknown") : new Intl.NumberFormat(lang.intl()).format(value)
  return (
    <div class="chat-inspect">
      <h3>{lang.t("chat.usageTotal")}</h3>
      <dl>
        <For
          each={
            [
              ["chat.requests", "request_count"],
              ["chat.tokens", "total_tokens"],
              ["chat.inputTokens", "input_tokens"],
              ["chat.cacheTokens", "cache_read_tokens"],
              ["chat.outputTokens", "output_tokens"],
              ["chat.reasonTokens", "reasoning_tokens"],
            ] as const
          }
        >
          {([key, k]) => (
            <>
              <dt>{lang.t(key)}</dt>
              <dd>{n(usage()?.[k])}</dd>
            </>
          )}
        </For>
        <dt>{lang.t(usage()?.cost_complete === false ? "chat.subtotal" : "chat.cost")}</dt>
        <dd>
          {usage() ? [usage()!.cost_amount, usage()!.cost_unit].filter(Boolean).join(" ") : lang.t("chat.unknown")}
        </dd>
      </dl>
      <Show when={usage()?.cost_complete === false}>
        <p>{lang.t("chat.partial")}</p>
      </Show>
      <h3>{lang.t("chat.context")}</h3>
      <dl>
        <dt>{lang.t("chat.occupancy")}</dt>
        <dd>
          {n(context()?.used_tokens)} / {n(context()?.window_tokens)}{" "}
          {context()?.used_percent != null ? "(" + n(context()!.used_percent) + "%)" : ""}
        </dd>
        <dt>{lang.t("chat.actual")}</dt>
        <dd>{context()?.as_of_model?.model_ref || lang.t("chat.unknown")}</dd>
      </dl>
    </div>
  )
}
