import { For, Show, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import type { NexusCommand } from "@opencode/protocol/nexus-command"
import type { ManagementClient } from "./client"
import { FieldRow } from "./fields"
import {
  clampDailyLimit,
  eventSourceError,
  filterRoutines,
  instantInput,
  routineCounts,
  routineStarts,
  type RoutineDoes,
  type RoutineFilter,
  type RoutineItem,
  type RoutinesOverview,
} from "./routines-model"

type Operation = Extract<typeof NexusCommand.Type, { action: "application.operation" }>["operation"]
type Rule = Extract<typeof NexusCommand.Type, { action: "routine.create" }>["rule"]

const operation = <T,>(c: ManagementClient, input: Operation) =>
  c.command<T>({ action: "application.operation", operation: input })

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

export function Routines(props: { client: ManagementClient }) {
  const c = props.client
  const dialog = useDialog()

  const [s, set] = createStore({
    data: null as RoutinesOverview | null,
    filter: "all" as RoutineFilter,
    removing: "",
  })

  const refresh = async () => {
    const result = await operation<RoutinesOverview>(c, { action: "routines" })
    set({ data: result, removing: "" })
  }

  onMount(() => void c.perform(refresh))

  const counts = () => routineCounts(s.data?.routines ?? [])
  const rows = () => filterRoutines(s.data?.routines ?? [], s.filter)
  const key = (row: RoutineItem) => row.kind + ":" + row.public_id

  const attentionSummary = () => {
    const policy = s.data?.attention_policy
    const hours = policy?.quiet_hours
    const label = hours?.enabled ? "Quiet " + (hours.start ?? "") + "–" + (hours.end ?? "") : "Quiet hours off"
    return label + " · Cap " + (policy?.daily_proactive_limit ?? 6) + "/day"
  }

  const toggle = (row: RoutineItem) =>
    void c.perform(async () => {
      await operation(c, {
        action: "routines.toggle",
        kind: row.kind,
        public_id: row.public_id,
        ...(row.kind === "time" && row.conversation_public_id ? { conversation: row.conversation_public_id } : {}),
        enabled: !row.enabled,
      })
      c.notice(row.enabled ? "Routine paused." : "Routine resumed.")
      await refresh()
    })

  const remove = (row: RoutineItem) =>
    void c.perform(async () => {
      await operation(c, {
        action: "routines.rm",
        kind: row.kind,
        public_id: row.public_id,
        ...(row.kind === "time" && row.conversation_public_id ? { conversation: row.conversation_public_id } : {}),
      })
      c.notice("Routine removed.")
      await refresh()
    })

  return (
    <section>
      <h2>Routines</h2>
      <p>
        Work the agent starts on a schedule or an external event.{" "}
        <strong>
          {counts().active} active · {counts().checkIns} silent check-in{counts().checkIns === 1 ? "" : "s"}
        </strong>
      </p>
      <div class="nexus-actions">
        <Button onClick={() => dialog.show(() => <AttentionDialog client={c} policy={s.data?.attention_policy} close={() => dialog.close()} saved={refresh} />)}>
          {attentionSummary()}
        </Button>
        <Show when={s.data?.observations.length}>
          <Button
            onClick={() =>
              dialog.show(() => <ObservationsDialog observations={s.data?.observations ?? []} />)
            }
          >
            {s.data?.observations.length} observed
          </Button>
        </Show>
        <Button onClick={() => dialog.show(() => <CreateRoutineDialog client={c} close={() => dialog.close()} saved={refresh} />)}>
          New routine
        </Button>
        <Button disabled={c.state.busy} onClick={() => void c.perform(refresh)}>
          Refresh
        </Button>
      </div>
      <div class="nexus-actions">
        <For
          each={
            [
              ["all", "All routines"],
              ["time", "Scheduled"],
              ["event", "Event-triggered"],
              ["check_in", "Silent check-ins"],
            ] as const
          }
        >
          {([filter, label]) => (
            <Button size="small" aria-pressed={s.filter === filter} onClick={() => set("filter", filter)}>
              {label}
            </Button>
          )}
        </For>
      </div>
      <Show when={s.data} fallback={<p>Loading routines…</p>}>
        <Show
          when={rows().length}
          fallback={
            <div class="nexus-card">
              <p>No routines in this view. Ask the agent on your Personal Desk to watch something, or create a routine directly.</p>
              <div class="nexus-actions">
                <Button onClick={() => dialog.show(() => <CreateRoutineDialog client={c} close={() => dialog.close()} saved={refresh} />)}>
                  Create routine
                </Button>
              </div>
            </div>
          }
        >
          <div class="nexus-columns">
            <For each={rows()}>
              {(row) => (
                <div class="nexus-card">
                  <h3>{row.name || "Untitled routine"}</h3>
                  <p>
                    <small>{routineStarts(row)}</small>
                  </p>
                  <p>{row.what.length > 240 ? row.what.slice(0, 240) + "…" : row.what}</p>
                  <p>
                    <span class="nexus-badge">{row.does === "check_in" ? "Silent check-in" : "Act & report"}</span>{" "}
                    <span
                      class={
                        "nexus-badge" +
                        (row.status === "active" ? " nexus-badge-ok" : row.status === "observe" ? " nexus-badge-warn" : "")
                      }
                    >
                      {row.status}
                    </span>
                  </p>
                  <small>
                    {row.kind === "time" && row.next_run_at
                      ? "Next: " + new Date(row.next_run_at).toLocaleString()
                      : row.kind === "event"
                        ? "Triggered by channel gate"
                        : ""}
                  </small>
                  <div class="nexus-actions">
                    <Button
                      size="small"
                      onClick={() =>
                        dialog.show(() => <EditRoutineDialog client={c} row={row} close={() => dialog.close()} saved={refresh} />)
                      }
                    >
                      Edit
                    </Button>
                    <Button size="small" disabled={c.state.busy} onClick={() => toggle(row)}>
                      {row.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Show
                      when={s.removing === key(row)}
                      fallback={
                        <Button size="small" onClick={() => set("removing", key(row))}>
                          Remove
                        </Button>
                      }
                    >
                      <Button size="small" disabled={c.state.busy} onClick={() => remove(row)}>
                        Confirm remove
                      </Button>
                      <Button size="small" onClick={() => set("removing", "")}>
                        Cancel
                      </Button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}

function CreateRoutineDialog(props: { client: ManagementClient; close(): void; saved(): Promise<void> }) {
  const c = props.client

  const [s, set] = createStore({
    kind: "time" as "time" | "event",
    does: "check_in" as RoutineDoes,
    name: "",
    what: "",
    cadence: "daily" as "daily" | "interval",
    localTime: "09:00",
    zone: browserZone(),
    seconds: 3600,
    startsAt: instantInput(new Date(Date.now() + 30 * 60_000).toISOString()),
    source: "*",
    pattern: "",
    error: "",
    key: crypto.randomUUID(),
  })

  const rule = (): Rule =>
    s.cadence === "daily"
      ? { kind: "daily", local_time: s.localTime, time_zone: s.zone.trim() || "UTC" }
      : {
          kind: "interval",
          every_seconds: Math.max(1, Math.round(s.seconds) || 3600),
          starts_at: new Date(s.startsAt).toISOString(),
        }

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const invalid = s.kind === "event" ? (!s.name.trim() ? "A routine name is required." : eventSourceError(s.source.trim())) : ""
    set("error", invalid)
    if (invalid) return
    void c.perform(async () => {
      if (s.kind === "time")
        await c.command({
          action: "routine.create",
          what: s.what.trim(),
          does: s.does,
          name: s.name.trim() || undefined,
          rule: rule(),
          key: s.key,
        })
      if (s.kind === "event")
        await operation(c, {
          action: "routines.create",
          kind: "event",
          name: s.name.trim(),
          source_key: s.source.trim() || "*",
          instructions: s.what.trim(),
          ...(s.pattern.trim() ? { pattern: s.pattern.trim() } : {}),
          does: s.does,
        })
      c.notice("Routine saved.")
      props.close()
      await props.saved()
    })
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup title="New routine" description="Define when the agent wakes up and whether it acts directly or checks in silently." />
      </DialogHeader>
      <DialogBody>
        <form onSubmit={submit} onInput={() => set("key", crypto.randomUUID())}>
          <Show when={s.error || c.state.error}>
            <p role="alert">{s.error || c.state.error}</p>
          </Show>
          <FieldRow label="Trigger">
            <select value={s.kind} onChange={(event) => set("kind", event.currentTarget.value as typeof s.kind)}>
              <option value="time">Time schedule</option>
              <option value="event">Channel event</option>
            </select>
          </FieldRow>
          <FieldRow label="Routine name">
            <input
              placeholder="e.g. Morning invoice & commitment check"
              value={s.name}
              onInput={(event) => set("name", event.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="What should the agent do?">
            <textarea
              required
              rows={3}
              placeholder="Describe the check or task clearly…"
              value={s.what}
              onInput={(event) => set("what", event.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Attention behavior">
            <select value={s.does} onChange={(event) => set("does", event.currentTarget.value as RoutineDoes)}>
              <option value="check_in">Silent check-in (interrupt only if needed)</option>
              <option value="act">Act &amp; report outcome</option>
            </select>
          </FieldRow>
          <Show when={s.kind === "time"}>
            <FieldRow label="Cadence">
              <select value={s.cadence} onChange={(event) => set("cadence", event.currentTarget.value as typeof s.cadence)}>
                <option value="daily">Daily at fixed time</option>
                <option value="interval">Every interval</option>
              </select>
            </FieldRow>
            <Show when={s.cadence === "daily"}>
              <FieldRow label="Time (HH:MM)">
                <input required type="time" value={s.localTime} onInput={(event) => set("localTime", event.currentTarget.value)} />
              </FieldRow>
              <FieldRow label="Time zone">
                <input required value={s.zone} onInput={(event) => set("zone", event.currentTarget.value)} />
              </FieldRow>
            </Show>
            <Show when={s.cadence === "interval"}>
              <FieldRow label="Every (seconds)">
                <input
                  required
                  type="number"
                  min={1}
                  value={s.seconds}
                  onInput={(event) => set("seconds", event.currentTarget.valueAsNumber)}
                />
              </FieldRow>
              <FieldRow label="First run">
                <input required type="datetime-local" step="1" value={s.startsAt} onInput={(event) => set("startsAt", event.currentTarget.value)} />
              </FieldRow>
            </Show>
          </Show>
          <Show when={s.kind === "event"}>
            <FieldRow label="Source key">
              <input value={s.source} onInput={(event) => set("source", event.currentTarget.value)} />
            </FieldRow>
            <FieldRow label="Keyword / text filter (optional)">
              <input
                placeholder="e.g. invoice, urgent, review requested"
                value={s.pattern}
                onInput={(event) => set("pattern", event.currentTarget.value)}
              />
            </FieldRow>
          </Show>
          <div class="nexus-actions">
            <Button type="submit" disabled={c.state.busy}>
              Save routine
            </Button>
            <Button type="button" onClick={props.close}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  )
}

function EditRoutineDialog(props: { client: ManagementClient; row: RoutineItem; close(): void; saved(): Promise<void> }) {
  const c = props.client
  const row = props.row
  const starts = row.kind === "time" ? row.starts : null
  const original = {
    cadence: starts?.kind === "interval" ? ("interval" as const) : starts?.kind === "once" ? ("once" as const) : ("daily" as const),
    localTime: (starts?.kind === "daily" ? starts.local_time : null) ?? "09:00",
    zone: (starts?.kind === "daily" ? starts.time_zone : null) ?? browserZone(),
    seconds: (starts?.kind === "interval" ? starts.every_seconds : null) ?? 3600,
    instant: instantInput((starts?.kind === "interval" ? starts.starts_at : null) ?? (starts?.kind === "once" ? starts.run_at : null)),
  }

  const [s, set] = createStore({
    name: row.name,
    what: row.what,
    does: (row.does === "check_in" ? "check_in" : "act") as RoutineDoes,
    pattern: row.kind === "event" ? (row.starts.pattern ?? "") : "",
    cadence: original.cadence,
    localTime: original.localTime,
    zone: original.zone,
    seconds: original.seconds,
    instant: original.instant,
  })

  const rule = (): Rule => {
    if (s.cadence === "daily") return { kind: "daily", local_time: s.localTime, time_zone: s.zone.trim() || "UTC" }
    // An untouched instant input keeps the stored instant byte-for-byte.
    if (s.cadence === "once")
      return {
        kind: "once",
        run_at: s.instant === original.instant && starts?.kind === "once" && starts.run_at ? starts.run_at : new Date(s.instant).toISOString(),
      }
    return {
      kind: "interval",
      every_seconds: Math.max(1, Math.round(s.seconds) || 3600),
      starts_at: s.instant === original.instant && starts?.kind === "interval" && starts.starts_at ? starts.starts_at : new Date(s.instant).toISOString(),
    }
  }

  const initialRule = (): Rule => {
    if (original.cadence === "daily")
      return { kind: "daily", local_time: original.localTime, time_zone: original.zone.trim() || "UTC" }
    if (original.cadence === "once")
      return { kind: "once", run_at: starts?.kind === "once" && starts.run_at ? starts.run_at : "" }
    return {
      kind: "interval",
      every_seconds: Math.max(1, Math.round(original.seconds) || 3600),
      starts_at: starts?.kind === "interval" && starts.starts_at ? starts.starts_at : "",
    }
  }
  const initial = JSON.stringify(initialRule())

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    void c.perform(async () => {
      if (row.kind === "event")
        await operation(c, {
          action: "routines.update",
          kind: "event",
          public_id: row.public_id,
          name: s.name.trim(),
          instructions: s.what.trim(),
          pattern: s.pattern.trim(),
          does: s.does,
        })
      if (row.kind === "time") {
        const selected = rule()
        await operation(c, {
          action: "routines.update",
          kind: "time",
          public_id: row.public_id,
          ...(row.conversation_public_id ? { conversation: row.conversation_public_id } : {}),
          expected_lock_version: row.lock_version,
          ...(s.name !== row.name ? { name: s.name.trim() } : {}),
          // does rides along so the server re-prefixes a check-in prompt the same way.
          ...(s.what !== row.what ? { prompt: s.what.trim(), does: row.does } : {}),
          ...(JSON.stringify(selected) !== initial ? { rule: selected } : {}),
        })
      }
      c.notice("Routine updated.")
      props.close()
      await props.saved()
    })
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup
          title={"Edit " + (row.kind === "time" ? "scheduled" : "event") + " routine"}
          description={row.kind === "time" ? "A stale version is refused; refresh the panel to review the saved routine." : "Event routines fire when a matching source event arrives."}
        />
      </DialogHeader>
      <DialogBody>
        <form onSubmit={submit}>
          <Show when={c.state.error}>
            <p role="alert">{c.state.error}</p>
          </Show>
          <FieldRow label="Routine name">
            <input value={s.name} onInput={(event) => set("name", event.currentTarget.value)} />
          </FieldRow>
          <FieldRow label={row.kind === "time" ? "Prompt" : "Instructions"}>
            <textarea required rows={3} value={s.what} onInput={(event) => set("what", event.currentTarget.value)} />
          </FieldRow>
          <Show when={row.kind === "event"}>
            <FieldRow label="Attention behavior">
              <select value={s.does} onChange={(event) => set("does", event.currentTarget.value as RoutineDoes)}>
                <option value="check_in">Silent check-in (interrupt only if needed)</option>
                <option value="act">Act &amp; report outcome</option>
              </select>
            </FieldRow>
            <FieldRow label="Keyword / text filter (optional)">
              <input value={s.pattern} onInput={(event) => set("pattern", event.currentTarget.value)} />
            </FieldRow>
          </Show>
          <Show when={row.kind === "time"}>
            <FieldRow label="Cadence">
              <select value={s.cadence} onChange={(event) => set("cadence", event.currentTarget.value as typeof s.cadence)}>
                <option value="daily">Daily at fixed time</option>
                <option value="interval">Every interval</option>
                <Show when={original.cadence === "once"}>
                  <option value="once">Once</option>
                </Show>
              </select>
            </FieldRow>
            <Show when={s.cadence === "daily"}>
              <FieldRow label="Time (HH:MM)">
                <input required type="time" value={s.localTime} onInput={(event) => set("localTime", event.currentTarget.value)} />
              </FieldRow>
              <FieldRow label="Time zone">
                <input required value={s.zone} onInput={(event) => set("zone", event.currentTarget.value)} />
              </FieldRow>
            </Show>
            <Show when={s.cadence === "interval"}>
              <FieldRow label="Every (seconds)">
                <input
                  required
                  type="number"
                  min={1}
                  value={s.seconds}
                  onInput={(event) => set("seconds", event.currentTarget.valueAsNumber)}
                />
              </FieldRow>
            </Show>
            <Show when={s.cadence !== "daily"}>
              <FieldRow label={s.cadence === "once" ? "Run at" : "First run"}>
                <input required type="datetime-local" step="1" value={s.instant} onInput={(event) => set("instant", event.currentTarget.value)} />
              </FieldRow>
            </Show>
          </Show>
          <div class="nexus-actions">
            <Button type="submit" disabled={c.state.busy}>
              Save routine
            </Button>
            <Button type="button" onClick={props.close}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  )
}

function AttentionDialog(props: {
  client: ManagementClient
  policy: RoutinesOverview["attention_policy"] | undefined
  close(): void
  saved(): Promise<void>
}) {
  const c = props.client
  const hours = props.policy?.quiet_hours

  const [s, set] = createStore({
    enabled: !!hours?.enabled,
    start: hours?.start || "23:00",
    end: hours?.end || "08:00",
    zone: hours?.time_zone || browserZone(),
    cap: String(props.policy?.daily_proactive_limit ?? 6),
  })

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    void c.perform(async () => {
      await operation(c, {
        action: "channels.attention",
        quiet_hours: { enabled: s.enabled, start: s.start, end: s.end, time_zone: s.zone },
        daily_proactive_limit: clampDailyLimit(s.cap),
      })
      c.notice("Attention policy saved.")
      props.close()
      await props.saved()
    })
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup
          title="Attention & quiet hours"
          description="Protect your focus: cap daily proactive pings and hold non-urgent outreach during quiet hours."
        />
      </DialogHeader>
      <DialogBody>
        <form onSubmit={submit}>
          <Show when={c.state.error}>
            <p role="alert">{c.state.error}</p>
          </Show>
          <FieldRow label="Enable quiet hours">
            <input type="checkbox" checked={s.enabled} onChange={(event) => set("enabled", event.currentTarget.checked)} />
          </FieldRow>
          <FieldRow label="Start">
            <input required type="time" value={s.start} onInput={(event) => set("start", event.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="End">
            <input required type="time" value={s.end} onInput={(event) => set("end", event.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Time zone">
            <input required value={s.zone} onInput={(event) => set("zone", event.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Daily proactive outreach cap">
            <input type="number" value={s.cap} onInput={(event) => set("cap", event.currentTarget.value)} />
          </FieldRow>
          <div class="nexus-actions">
            <Button type="submit" disabled={c.state.busy}>
              Save policy
            </Button>
            <Button type="button" onClick={props.close}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  )
}

function ObservationsDialog(props: { observations: RoutinesOverview["observations"] }) {
  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup
          title="Observed channel events"
          description="Zero-LLM-token gate audit log showing how incoming events matched your rules."
        />
      </DialogHeader>
      <DialogBody>
        <Show when={props.observations.length} fallback={<p>No gate observations recorded yet.</p>}>
          <For each={props.observations}>
            {(observation) => (
              <article>
                <p>
                  <strong>{observation.source_key}</strong> <span>{observation.decision}</span>
                </p>
                <Show when={observation.matched_rules?.length}>
                  <p>
                    <small>Matched rules: {observation.matched_rules?.join(", ")}</small>
                  </p>
                </Show>
                <Show when={observation.preview}>
                  <p>{observation.preview}</p>
                </Show>
                <Show when={observation.observed_at}>
                  {(observedAt) => <small>{new Date(observedAt()).toLocaleString()}</small>}
                </Show>
              </article>
            )}
          </For>
        </Show>
      </DialogBody>
    </Dialog>
  )
}
