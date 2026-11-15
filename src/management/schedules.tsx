import { For, Show, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import type { Schedule, ScheduleExecutionPage } from "@cybros/agent"
import type { NexusCommand } from "@opencode/protocol/nexus-command"
import type { ManagementClient } from "./client"
import { FieldRow } from "./fields"
import { request } from "../nexus/controller"
import type { RecentPage } from "../nexus/chat"

type ScheduleRow = Schedule & { writable?: boolean }

type Rule = Extract<typeof NexusCommand.Type, { action: "schedule.create" }>["rule"]

export function Schedules(props: { client: ManagementClient; open(workspace: string, conversation: string): void }) {
  const c = props.client

  const [s, set] = createStore({
    rows: [] as ScheduleRow[],
    chats: [] as RecentPage["items"],
    after: null as string | null,
    editing: null as Schedule | null,
    name: "",
    model: "",
    conversation: c.chat.s.id,
    prompt: "",
    kind: "once",
    instant: "",
    seconds: 3600,
    local: "09:00",
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    approval: "ask" as "ask" | "rules" | "bypass",
    key: crypto.randomUUID(),
    executions: null as ScheduleExecutionPage | null,
    executionJob: null as Schedule | null,
  })

  const refresh = async (after?: string) => {
    const page = await c.command<{ items: ScheduleRow[]; next_after: string | null }>({
      action: "schedule.list",
      workspace: c.workspace(),
      after,
    })

    set("rows", after ? [...s.rows, ...page.items] : page.items)
    set("after", page.next_after)
  }

  onMount(
    () =>
      void c.perform(async () => {
        await refresh()
        set("chats", (await request<RecentPage>("/chats", c.scope())).items)
      }),
  )

  const rule = (): Rule =>
    s.kind === "daily"
      ? { kind: "daily", local_time: s.local, time_zone: s.zone }
      : s.kind === "interval"
        ? { kind: "interval", starts_at: new Date(s.instant).toISOString(), every_seconds: s.seconds }
        : { kind: "once", run_at: new Date(s.instant).toISOString() }

  const edit = (row: Schedule) =>
    set({
      editing: row,
      name: row.name ?? "",
      model: row.model?.model ?? "",
      prompt: row.prompt,
      conversation: row.conversation_public_id ?? "",
      kind: row.rule.kind,
      instant: localDate(row.rule.run_at ?? row.rule.starts_at),
      seconds: row.rule.every_seconds ?? 3600,
      local: row.rule.local_time ?? "09:00",
      zone: row.rule.time_zone ?? s.zone,
      approval: row.approval_mode === "bypass" ? "bypass" : row.approval_mode === "rules" ? "rules" : "ask",
    })

  const executions = async (row: Schedule, after?: string) => {
    const page = await c.command<ScheduleExecutionPage>({
      action: "schedule.executions",
      workspace: c.workspace(),
      conversation: row.conversation_public_id!,
      id: row.public_id,
      after,
    })

    set({
      executionJob: row,
      executions: { ...page, items: after ? [...(s.executions?.items ?? []), ...page.items] : page.items },
    })
  }

  return (
    <section>
      <h2>Scheduled jobs</h2>
      <Button disabled={c.state.busy} onClick={() => void c.perform(() => refresh())}>
        Refresh
      </Button>
      <For each={["Active", "Paused", "Finished"]}>
        {(group) => (
          <div class="nexus-card">
            <h3>{group}</h3>
            <For
              each={s.rows
                .filter((row) =>
                  group === "Paused"
                    ? row.status === "paused"
                    : group === "Active"
                      ? row.status === "active"
                      : !["active", "paused"].includes(row.status),
                )
                .sort((a, b) =>
                  group === "Active"
                    ? (Date.parse(a.next_run_at ?? "") || Infinity) - (Date.parse(b.next_run_at ?? "") || Infinity)
                    : 0,
                )}
            >
              {(row) => (
                <article>
                  <strong>{row.name || row.prompt}</strong>
                  <p>{row.prompt}</p>
                  <small>
                    {scheduleRule(row)} · {row.next_run_at ? new Date(row.next_run_at).toLocaleString() : row.status}
                  </small>
                  <Show when={row.last_execution}>
                    {(execution) => (
                      <Button
                        disabled={!execution().child_conversation_public_id}
                        onClick={() => props.open(c.workspace(), execution().child_conversation_public_id)}
                      >
                        Latest execution: {execution().status}
                      </Button>
                    )}
                  </Show>
                  <Show when={row.writable === false}>
                    <p>Read-only conversation</p>
                  </Show>
                  <div class="nexus-actions">
                    <Button
                      disabled={!row.conversation_public_id}
                      onClick={() => props.open(c.workspace(), row.conversation_public_id!)}
                    >
                      Open conversation
                    </Button>
                    <Show when={row.writable !== false && ["active", "paused"].includes(row.status)}>
                      <Button disabled={c.state.busy || !row.conversation_public_id} onClick={() => edit(row)}>
                        Edit
                      </Button>
                      <For each={["run", row.status === "paused" ? "resume" : "pause", "cancel"] as const}>
                        {(action) => (
                          <Button
                            disabled={c.state.busy || !row.conversation_public_id}
                            onClick={() =>
                              void c.perform(async () => {
                                await c.command({
                                  action: `schedule.${action}`,
                                  workspace: c.workspace(),
                                  conversation: row.conversation_public_id!,
                                  id: row.public_id,
                                })
                                await refresh()
                              })
                            }
                          >
                            {action === "run"
                              ? "Run now"
                              : action === "cancel"
                                ? "Cancel job"
                                : action === "pause"
                                  ? "Pause"
                                  : "Resume"}
                          </Button>
                        )}
                      </For>
                    </Show>
                    <Button
                      disabled={c.state.busy || !row.conversation_public_id}
                      onClick={() => void c.perform(() => executions(row))}
                    >
                      Executions
                    </Button>
                  </div>
                </article>
              )}
            </For>
          </div>
        )}
      </For>
      <Show when={s.after}>
        <Button onClick={() => void c.perform(() => refresh(s.after!))}>Load more jobs</Button>
      </Show>
      <Show when={s.executions}>
        {(page) => (
          <div class="nexus-card">
            <h3>Executions: {s.executionJob?.name || s.executionJob?.prompt}</h3>
            <Show when={!page().items.length}>
              <p>No executions yet.</p>
            </Show>
            <For each={page().items}>
              {(row) => (
                <div class="nexus-actions">
                  <span>
                    {new Date(row.scheduled_for).toLocaleString()} · {row.status}
                  </span>
                  <Show when={row.child_conversation_public_id}>
                    <Button onClick={() => props.open(c.workspace(), row.child_conversation_public_id!)}>
                      Open execution
                    </Button>
                  </Show>
                </div>
              )}
            </For>
            <Show when={page().next_after}>
              <Button
                disabled={c.state.busy}
                onClick={() => void c.perform(() => executions(s.executionJob!, page().next_after!))}
              >
                Load more executions
              </Button>
            </Show>
          </div>
        )}
      </Show>
      <form
        class="nexus-card"
        onInput={() => set("key", crypto.randomUUID())}
        onSubmit={(event) => {
          event.preventDefault()
          void c.perform(async () => {
            if (s.editing)
              await c.command({
                action: "schedule.update",
                workspace: c.workspace(),
                conversation: s.conversation,
                id: s.editing.public_id,
                version: s.editing.lock_version,
                name: s.name,
                ...(s.model && s.model !== (s.editing.model?.model ?? "") ? { model: s.model } : {}),
                approval: s.approval,
                prompt: s.prompt,
                rule: rule(),
              })
            else
              await c.command({
                action: "schedule.create",
                workspace: c.workspace(),
                conversation: s.conversation,
                name: s.name || undefined,
                ...(s.model ? { model: s.model } : {}),
                prompt: s.prompt,
                key: s.key,
                rule: rule(),
                approval: s.approval,
              })
            set({ editing: null, prompt: "", name: "", key: crypto.randomUUID() })
            await refresh()
          })
        }}
      >
        <h3>{s.editing ? "Edit scheduled job" : "New scheduled job"}</h3>
        <fieldset disabled={c.state.busy}>
          <FieldRow label="Conversation">
            <select
              required
              disabled={!!s.editing}
              value={s.conversation}
              onChange={(e) => set("conversation", e.currentTarget.value)}
            >
              <option value="">Choose a conversation</option>
              <Show when={s.conversation && !s.chats.some((row) => row.id === s.conversation)}>
                <option value={s.conversation}>{s.conversation}</option>
              </Show>
              <For each={s.chats}>
                {(row) => (
                  <option value={row.id} selected={s.conversation === row.id}>
                    {row.title || row.id}
                  </option>
                )}
              </For>
            </select>
          </FieldRow>
          <FieldRow label="Name">
            <input value={s.name} onInput={(e) => set("name", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Prompt">
            <textarea required value={s.prompt} onInput={(e) => set("prompt", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Model">
            <select value={s.model} onChange={(e) => set("model", e.currentTarget.value)}>
              <Show when={!s.editing?.model}>
                <option value="">Automatic</option>
              </Show>
              <Show when={s.model && !c.chat.s.choices?.models.includes(s.model)}>
                <option value={s.model}>{s.model} (unavailable)</option>
              </Show>
              <For each={c.chat.s.choices?.models}>
                {(model) => (
                  <option value={model} selected={s.model === model}>
                    {model}
                  </option>
                )}
              </For>
            </select>
          </FieldRow>
          <FieldRow label="Repeat">
            <select value={s.kind} onChange={(e) => set("kind", e.currentTarget.value)}>
              <option value="once">Once</option>
              <option value="interval">Every interval</option>
              <option value="daily">Daily</option>
            </select>
          </FieldRow>
          <Show when={s.kind !== "daily"}>
            <FieldRow label="First run">
              <input
                required
                type="datetime-local"
                value={s.instant}
                onInput={(e) => set("instant", e.currentTarget.value)}
              />
            </FieldRow>
          </Show>
          <Show when={s.kind === "interval"}>
            <FieldRow label="Every (seconds)">
              <input
                type="number"
                min={1}
                value={s.seconds}
                onInput={(e) => set("seconds", e.currentTarget.valueAsNumber)}
              />
            </FieldRow>
          </Show>
          <Show when={s.kind === "daily"}>
            <FieldRow label="Local time">
              <input type="time" value={s.local} onInput={(e) => set("local", e.currentTarget.value)} />
            </FieldRow>
            <FieldRow label="Time zone">
              <input value={s.zone} onInput={(e) => set("zone", e.currentTarget.value)} />
            </FieldRow>
          </Show>
          <FieldRow label="Permissions">
            <select value={s.approval} onChange={(e) => set("approval", e.currentTarget.value as typeof s.approval)}>
              <For each={c.chat.s.choices?.approvals ?? ["ask", "rules"]}>
                {(mode) => (
                  <option value={mode}>
                    {mode === "ask" ? "Ask before changes" : mode === "rules" ? "Rules only" : "Bypass permissions"}
                  </option>
                )}
              </For>
            </select>
          </FieldRow>
          <Button type="submit">Save job</Button>
          <Show when={s.editing}>
            <Button
              type="button"
              onClick={() => set({ editing: null, model: "", prompt: "", name: "", key: crypto.randomUUID() })}
            >
              New job
            </Button>
          </Show>
        </fieldset>
      </form>
    </section>
  )
}

function localDate(value: string | null | undefined) {
  if (!value) return ""
  const date = new Date(value)

  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function scheduleRule(row: Schedule) {
  const rule = row.rule

  if (rule.kind === "daily") return `Daily at ${rule.local_time} (${rule.time_zone})`

  if (rule.kind === "interval") return `Every ${rule.every_seconds} seconds`

  return "Once"
}
