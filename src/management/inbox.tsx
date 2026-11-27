import { For, Show, createEffect, on, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Markdown } from "@opencode/session-ui/markdown"
import type { NexusCommand } from "@opencode/protocol/nexus-command"
import type { ManagementClient } from "./client"
import { request } from "../nexus/controller"
import { DecisionDock } from "../nexus/decision"
import type { Resolution, Snapshot } from "../nexus/chat"
import {
  inboxReason,
  inboxRows,
  inboxTabs,
  snoozeLabel,
  snoozePresets,
  type InboxFilter,
  type InboxItem,
  type InboxPartition,
} from "./inbox-model"

type Operation = Extract<typeof NexusCommand.Type, { action: "application.operation" }>["operation"]

const operation = <T,>(c: ManagementClient, input: Operation) =>
  c.command<T>({ action: "application.operation", operation: input })

export function Inbox(props: {
  client: ManagementClient
  open(workspace: string, conversation: string): void
  reviewDrafts(): void
}) {
  const c = props.client

  const [s, set] = createStore({
    data: null as InboxPartition | null,
    filter: "needs_you" as InboxFilter,
    settled: false,
    selected: "",
    snoozeOpen: false,
    chat: null as Snapshot | null,
    reply: "",
  })

  const rows = () => (s.data ? inboxRows(s.data, s.filter) : [])
  const item = () => rows().find((row) => row.public_id === s.selected)
  const tabs = () =>
    inboxTabs(s.data?.counts ?? { needs_you: 0, running: 0, snoozed: 0, done: 0, skill_drafts: 0 })
  const preview = () => (s.chat?.turns ?? []).slice(-10)
  const blocked = () => !!s.chat?.detail?.owned || !!s.chat?.detail?.archived
  const readOnly = () => blocked() || s.chat?.detail?.writable === false

  const readChat = async (id: string) => {
    const chat = await request<Snapshot>("/chats/" + encodeURIComponent(id), c.scope())
    if (s.selected === id) set("chat", chat)
  }

  const refresh = async () => {
    const result = await operation<{ inbox: InboxPartition }>(c, { action: "inbox" })
    // Land on the full queue once when nothing is waiting on the Human.
    const filter = !s.settled && !result.inbox.sections.needs_you.length ? "all" : s.filter
    set({ data: result.inbox, settled: true, filter })
  }

  onMount(() => void c.perform(refresh))

  // Keep the selection on a visible row across tab switches and refreshes.
  createEffect(() => {
    const visible = rows()
    if (visible.some((row) => row.public_id === s.selected)) return
    set("selected", visible[0]?.public_id ?? "")
  })

  createEffect(
    on(
      () => s.selected,
      (id) => {
        set({ chat: null, snoozeOpen: false })
        if (!id) return
        void readChat(id).catch(c.reportError)
      },
    ),
  )

  const mutate = (input: Operation, notice: string) =>
    void c.perform(async () => {
      await operation(c, input)
      set("snoozeOpen", false)
      c.notice(notice)
      await refresh()
    })

  const done = (row: InboxItem) => mutate({ action: "inbox.done", conversation: row.public_id }, "Marked done.")

  const open = (row: InboxItem) => {
    void operation(c, { action: "inbox.read", conversation: row.public_id, activity_at: row.last_activity_at }).catch(
      () => {},
    )
    props.open(row.workspace_public_id, row.public_id)
  }

  const decide = (run: string, key: string, response: Resolution) =>
    void c.perform(async () => {
      await request("/chats/" + encodeURIComponent(s.selected) + "/decisions", c.scope(), { run, key, response })
      await Promise.all([refresh(), readChat(s.selected)])
    })

  const send = () => {
    const text = s.reply.trim()
    const id = s.selected
    if (!text || !id) return
    void c.perform(async () => {
      // The sealed two-step send mirrors the composer: prepare signs the exact body, inputs submits it.
      const body = { key: crypto.randomUUID(), text, model: null, delivery: "queue" }
      const prepared = await request<{ ticket: string }>(
        "/chats/" + encodeURIComponent(id) + "/prepare",
        c.scope(),
        body,
      )
      await request("/chats/" + encodeURIComponent(id) + "/inputs", c.scope(), { ...body, ticket: prepared.ticket })
      set("reply", "")
      c.notice("Sent to thread.")
      await Promise.all([refresh(), readChat(id)])
    })
  }

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest("input, textarea, select, [contenteditable]")) return
      const visible = rows()
      if (!visible.length) return
      const index = visible.findIndex((row) => row.public_id === s.selected)
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault()
        set("selected", visible[(index + 1) % visible.length].public_id)
        return
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault()
        set("selected", visible[(index - 1 + visible.length) % visible.length].public_id)
        return
      }
      const current = item()
      if (!current) return
      if (event.key === "e" && current.section !== "done") {
        event.preventDefault()
        done(current)
        return
      }
      // A focused button or link already owns Enter.
      if (event.key === "Enter" && !target?.closest("button, a")) {
        event.preventDefault()
        open(current)
      }
    }
    document.addEventListener("keydown", onKey)
    onCleanup(() => document.removeEventListener("keydown", onKey))
  })

  return (
    <section>
      <h2>Inbox</h2>
      <p>
        Sorted by whose turn it is. Background tasks run silently until a decision or deliverable is ready.{" "}
        <Show when={s.data} fallback={<small>Loading inbox…</small>}>
          {(data) => (
            <strong>
              {data().counts.needs_you > 0 ? data().counts.needs_you + " awaiting you" : "Inbox zero"}
            </strong>
          )}
        </Show>
      </p>
      <Show when={s.data?.counts.skill_drafts}>
        {(count) => (
          <p class="nexus-card" role="status">
            {count()} proposed skill{count() === 1 ? "" : "s"} drafted by the agent and waiting for your approval in
            the Knowledge panel.{" "}
            <Button size="small" onClick={() => props.reviewDrafts()}>
              Review proposals
            </Button>
          </p>
        )}
      </Show>
      <div class="nexus-actions">
        <For each={tabs()}>
          {(tab) => (
            <Button size="small" aria-pressed={s.filter === tab.key} onClick={() => set("filter", tab.key)}>
              {tab.label} ({tab.count})
            </Button>
          )}
        </For>
        <Button size="small" disabled={c.state.busy} onClick={() => void c.perform(refresh)}>
          Refresh
        </Button>
        <small>
          <kbd>J</kbd>
          <kbd>K</kbd> navigate · <kbd>E</kbd> done · <kbd>↵</kbd> open
        </small>
      </div>
      <div class="nexus-inbox">
        <div class="nexus-inbox-list">
          <Show when={s.data}>
            <Show
              when={rows().length}
              fallback={
                <p>
                  {s.filter === "needs_you"
                    ? "Nothing needs your attention. Quiet routines and background tasks stay out of your way until they finish or hit a decision."
                    : "No items in this view."}
                </p>
              }
            >
              <For each={rows()}>
                {(row) => (
                  <button
                    type="button"
                    class="nexus-inbox-row"
                    classList={{ "nexus-inbox-selected": row.public_id === s.selected }}
                    onClick={() => set("selected", row.public_id)}
                  >
                    <span class="nexus-inbox-row-title">
                      <strong>{row.title || "Untitled task"}</strong>
                      <small>{new Date(row.last_activity_at).toLocaleString()}</small>
                    </span>
                    <span class="nexus-inbox-row-badges">
                      <span class={"nexus-badge nexus-badge-" + inboxReason(row.reason).tone}>
                        {inboxReason(row.reason).label}
                      </span>
                      <Show when={row.is_personal_desk}>
                        <span class="nexus-badge">Personal Desk</span>
                      </Show>
                      <Show when={row.snoozed_until}>
                        {(until) => <span class="nexus-badge">Snoozed · {snoozeLabel(until())}</span>}
                      </Show>
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </Show>
        </div>
        <div class="nexus-inbox-detail">
          <Show when={item()} fallback={<p>Select a task to inspect. Preview deliverables, approve held actions or reply inline without leaving Inbox.</p>}>
            {(row) => (
              <>
                <div class="nexus-inbox-toolbar">
                  <div class="nexus-inbox-heading">
                    <strong>{row().title || "Untitled task"}</strong>
                    <small>
                      {inboxReason(row().reason).label} · ID {row().public_id.slice(0, 12)}
                    </small>
                  </div>
                  <div class="nexus-actions">
                    <Show when={row().section === "snoozed"}>
                      <Button
                        size="small"
                        disabled={c.state.busy}
                        onClick={() =>
                          mutate(
                            { action: "inbox.snooze", conversation: row().public_id, until_at: null },
                            "Woke task now.",
                          )
                        }
                      >
                        Wake now
                      </Button>
                    </Show>
                    <Show when={row().section !== "done" && row().section !== "snoozed"}>
                      <span class="nexus-snooze">
                        <Button size="small" disabled={c.state.busy} onClick={() => set("snoozeOpen", !s.snoozeOpen)}>
                          Snooze
                        </Button>
                        <Show when={s.snoozeOpen}>
                          <span class="nexus-snooze-menu">
                            <For each={snoozePresets(new Date())}>
                              {(preset) => (
                                <Button
                                  size="small"
                                  disabled={c.state.busy}
                                  onClick={() =>
                                    mutate(
                                      { action: "inbox.snooze", conversation: row().public_id, until_at: preset.untilAt },
                                      "Snoozed (" + preset.label + ").",
                                    )
                                  }
                                >
                                  {preset.label}
                                </Button>
                              )}
                            </For>
                          </span>
                        </Show>
                      </span>
                    </Show>
                    <Show when={row().section !== "done"}>
                      <Button size="small" disabled={c.state.busy} onClick={() => done(row())}>
                        Mark done
                      </Button>
                    </Show>
                    <Button size="small" onClick={() => open(row())}>
                      Open full thread
                    </Button>
                  </div>
                </div>
                <Show when={s.chat?.decisions.length}>
                  <div class="nexus-inbox-decisions">
                    <For each={s.chat?.decisions ?? []}>
                      {(decision) => (
                        <DecisionDock
                          decision={decision}
                          sending={c.state.busy || blocked()}
                          reply={(response) => decide(decision.run, decision.key, response)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
                <div class="nexus-inbox-transcript">
                  <Show when={s.chat} fallback={<p>Loading recent context…</p>}>
                    <Show when={preview().length} fallback={<p>No messages recorded yet. Send an instruction below or open the full thread.</p>}>
                      <For each={preview()}>
                        {(turn) => (
                          <>
                            <Show when={turn.prompt}>
                              <div class="nexus-inbox-turn nexus-inbox-you">
                                <small>You</small>
                                <p>{turn.prompt}</p>
                              </div>
                            </Show>
                            <Show when={turn.text || (!turn.prompt && turn.run)}>
                              <div class="nexus-inbox-turn">
                                <small>
                                  OpenCode{turn.status && turn.status !== "completed" ? " · " + turn.status : ""}
                                </small>
                                <Show when={turn.text} fallback={<p>Working / tool execution…</p>}>
                                  <Markdown text={turn.text} />
                                </Show>
                              </div>
                            </Show>
                          </>
                        )}
                      </For>
                    </Show>
                  </Show>
                </div>
                <form
                  class="nexus-inbox-reply"
                  onSubmit={(event) => {
                    event.preventDefault()
                    send()
                  }}
                >
                  <input
                    aria-label={"Reply to " + (row().title || "task")}
                    placeholder={"Reply or steer “" + (row().title || "task") + "”…"}
                    disabled={readOnly()}
                    value={s.reply}
                    onInput={(event) => set("reply", event.currentTarget.value)}
                  />
                  <Button type="submit" disabled={c.state.busy || readOnly() || !s.reply.trim()}>
                    Send
                  </Button>
                </form>
              </>
            )}
          </Show>
        </div>
      </div>
    </section>
  )
}
