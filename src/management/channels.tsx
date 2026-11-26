import { For, Show, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import type { NamedAgent, OutboxMessage } from "@cybros/agent"
import type { NexusBot } from "@opencode/schema/nexus-bot"
import type { NexusCommand } from "@opencode/protocol/nexus-command"
import type { ManagementClient } from "./client"
import { FieldRow } from "./fields"
import { acceptModes, ingestSummary, parseList, sourceError, type GateMode } from "./channels-model"

type Operation = Extract<typeof NexusCommand.Type, { action: "application.operation" }>["operation"]

const operation = <T,>(c: ManagementClient, input: Operation) =>
  c.command<T>({ action: "application.operation", operation: input })

type Source = {
  source_key: string
  name: string
  kind: string
  enabled: boolean
  target: string
  accept_mode: string
  allowed_senders: string[]
  allowed_bots: string[]
  updated_at?: string
}

type Observation = {
  public_id: string
  source_key: string
  external_id: string
  thread_key: string
  decision: string
  matched_rules: string[]
  preview: string
  observed_at: string
}

type Settlement = { public_id: string; outcome: string; reason?: string; error?: string }

type Overview = {
  sources: Source[]
  attention_policy: { daily_proactive_limit?: number }
  observations: Observation[]
  desks: Record<string, string>
  active_adapters: string[]
  outbox_messages: OutboxMessage[]
}

type Peer = NamedAgent & { settings?: NexusBot.Settings }

export function Channels(props: { client: ManagementClient }) {
  const c = props.client
  const dialog = useDialog()

  const [s, set] = createStore({
    tab: "sources" as "sources" | "telegram" | "peers",
    overview: null as Overview | null,
    peers: null as Peer[] | null,
    outcome: "",
    settlements: null as Settlement[] | null,
    removing: "",
  })

  const refresh = async () => {
    const result = await operation<{ channels: Overview }>(c, { action: "channels" })
    set({ overview: result.channels, removing: "" })
  }

  onMount(() => void c.perform(refresh))

  const selectTab = (tab: typeof s.tab) => {
    set("tab", tab)
    if (tab !== "peers" || s.peers !== null) return
    void c.perform(async () => set("peers", await c.command<Peer[]>({ action: "bot.list" })))
  }

  const upsert = (source: Source, patch: { accept_mode?: GateMode; enabled?: boolean }) =>
    void c.perform(async () => {
      await operation(c, {
        action: "channels.source",
        source_key: source.source_key,
        name: source.name,
        kind: source.kind,
        enabled: patch.enabled ?? source.enabled,
        target: source.target,
        accept_mode: patch.accept_mode ?? source.accept_mode,
        allowed_senders: source.allowed_senders,
        allowed_bots: source.allowed_bots,
      })
      c.notice(
        patch.accept_mode
          ? source.name + " gate set to " + patch.accept_mode + "."
          : source.name + (patch.enabled ? " enabled." : " disabled."),
      )
      await refresh()
    })

  const remove = (source: Source) =>
    void c.perform(async () => {
      await operation(c, { action: "channels.source.rm", source_key: source.source_key })
      c.notice("Removed " + source.source_key + ".")
      await refresh()
    })

  const drain = () =>
    void c.perform(async () => {
      const result = await operation<{ settlements: Settlement[] }>(c, { action: "channels.outbox.drain" })
      await refresh()
      set("settlements", result.settlements)
    })

  return (
    <section>
      <h2>Channels &amp; Peers</h2>
      <p>
        Personal reach connectors with deterministic off / observe / auto intake gates, a durable outbox and scoped
        peer bots.
      </p>
      <div class="nexus-actions">
        <For
          each={
            [
              ["sources", "Sources & Gate"],
              ["telegram", "Telegram"],
              ["peers", "Peers"],
            ] as const
          }
        >
          {([tab, label]) => (
            <Button aria-pressed={s.tab === tab} onClick={() => selectTab(tab)}>
              {label}
            </Button>
          )}
        </For>
        <Show when={s.tab === "sources"}>
          <Button
            onClick={() =>
              dialog.show(() => (
                <SimulateDialog
                  client={c}
                  sources={s.overview?.sources ?? []}
                  close={() => dialog.close()}
                  done={(summary) => set("outcome", summary)}
                />
              ))
            }
          >
            Simulate event
          </Button>
          <Button
            onClick={() =>
              dialog.show(() => (
                <SourceDialog client={c} close={() => dialog.close()} saved={() => refresh()} />
              ))
            }
          >
            Add source
          </Button>
        </Show>
        <Button disabled={c.state.busy} onClick={() => void c.perform(refresh)}>
          Refresh
        </Button>
      </div>
      <Show when={s.tab === "sources"}>
        <Show when={s.outcome}>
          <p role="status">Event outcome: {s.outcome}</p>
        </Show>
        <Show when={s.overview} fallback={<p>Loading channels…</p>}>
          {(overview) => (
            <>
              <h3>Intake sources ({overview().sources.length})</h3>
              <Show when={overview().active_adapters.length}>
                <p>
                  <small>Active outbound adapters: {overview().active_adapters.join(", ")}</small>
                </p>
              </Show>
              <Show when={!overview().sources.length}>
                <p>
                  No external sources registered. Start new sources in observe mode to audit event volume at zero
                  token cost before switching to auto.
                </p>
              </Show>
              <For each={overview().sources}>
                {(source) => (
                  <div class="nexus-card">
                    <h3>{source.name}</h3>
                    <p>
                      <code>{source.source_key}</code>
                    </p>
                    <p>
                      <small>
                        {source.kind} · routes to{" "}
                        {source.target === "personal" ? "Personal Desk (owner)" : source.target}
                        {source.allowed_senders.length ? " · senders: " + source.allowed_senders.join(", ") : ""}
                        {source.allowed_bots.length ? " · bots: " + source.allowed_bots.join(", ") : ""}
                      </small>
                    </p>
                    <div class="nexus-actions">
                      <For each={acceptModes}>
                        {(mode) => (
                          <Button
                            size="small"
                            aria-pressed={source.accept_mode === mode}
                            disabled={c.state.busy}
                            onClick={() => upsert(source, { accept_mode: mode })}
                          >
                            {mode}
                          </Button>
                        )}
                      </For>
                      <Button
                        size="small"
                        disabled={c.state.busy}
                        onClick={() => upsert(source, { enabled: !source.enabled })}
                      >
                        {source.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Show
                        when={s.removing === source.source_key}
                        fallback={
                          <Button size="small" onClick={() => set("removing", source.source_key)}>
                            Remove
                          </Button>
                        }
                      >
                        <Button size="small" disabled={c.state.busy} onClick={() => remove(source)}>
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
              <div class="nexus-card">
                <h3>Durable outbox</h3>
                <p>
                  <small>Lease-claimed replies delivered to external channels.</small>
                </p>
                <div class="nexus-actions">
                  <Button disabled={c.state.busy} onClick={drain}>
                    Drain now
                  </Button>
                </div>
                <Show when={s.settlements}>
                  {(settlements) => (
                    <div role="status">
                      <Show when={!settlements().length}>
                        <p>Nothing to drain.</p>
                      </Show>
                      <For each={settlements()}>
                        {(row) => (
                          <p>
                            {row.public_id} · {row.outcome}
                            {row.reason ? " · " + row.reason : ""}
                            {row.error ? " · " + row.error : ""}
                          </p>
                        )}
                      </For>
                    </div>
                  )}
                </Show>
                <Show when={!overview().outbox_messages.length}>
                  <p>Outbox is empty.</p>
                </Show>
                <For each={overview().outbox_messages}>
                  {(message) => (
                    <article>
                      <p>
                        <strong>
                          {message.channel_key} · {message.thread_key}
                        </strong>{" "}
                        <span>{message.status}</span>
                      </p>
                      <p>{message.body}</p>
                      <small>
                        {message.purpose} · {message.attempts_count} attempt
                        {message.attempts_count === 1 ? "" : "s"}
                        {message.last_error ? " · " + message.last_error : ""}
                        {message.next_attempt_at
                          ? " · next attempt " + new Date(message.next_attempt_at).toLocaleString()
                          : ""}
                      </small>
                    </article>
                  )}
                </For>
              </div>
              <div class="nexus-card">
                <h3>Recent gate decisions</h3>
                <p>
                  <small>Deterministic filter outcomes recorded by the intake gate.</small>
                </p>
                <Show when={!overview().observations.length}>
                  <p>No gate observations recorded yet.</p>
                </Show>
                <For each={overview().observations}>
                  {(observation) => (
                    <article>
                      <p>
                        <strong>{observation.source_key}</strong> <span>{observation.decision}</span>
                      </p>
                      <Show when={observation.matched_rules.length}>
                        <p>
                          <small>Matched rules: {observation.matched_rules.join(", ")}</small>
                        </p>
                      </Show>
                      <Show when={observation.preview}>
                        <p>{observation.preview}</p>
                      </Show>
                      <small>{new Date(observation.observed_at).toLocaleString()}</small>
                    </article>
                  )}
                </For>
              </div>
            </>
          )}
        </Show>
      </Show>
      <Show when={s.tab === "telegram"}>
        <div class="nexus-card">
          <h3>Telegram reach</h3>
          <p>
            Telegram connections, bot routing and access lists are managed by the Telegram integration. Open the
            Integrations panel and choose Telegram to connect your personal agent or peer bots to Telegram.
          </p>
        </div>
      </Show>
      <Show when={s.tab === "peers"}>
        <div class="nexus-card">
          <h3>Scoped peers</h3>
          <p>Peer bots are created and configured in the Bots panel. This workspace's bots are listed read-only.</p>
        </div>
        <Show when={s.peers} fallback={<p>Loading peers…</p>}>
          {(peers) => (
            <>
              <Show when={!peers().length}>
                <p>No bots in this workspace yet.</p>
              </Show>
              <For each={peers()}>
                {(peer) => (
                  <div class="nexus-card">
                    <h3>{peer.display_name || peer.name}</h3>
                    <p>
                      <small>
                        @{peer.handle}
                        {peer.settings ? " · " + peer.settings.audience : ""}
                      </small>
                    </p>
                    <Show when={peer.description}>
                      <p>{peer.description}</p>
                    </Show>
                  </div>
                )}
              </For>
            </>
          )}
        </Show>
      </Show>
    </section>
  )
}

function SourceDialog(props: { client: ManagementClient; close(): void; saved(): Promise<void> }) {
  const c = props.client

  const [s, set] = createStore({
    key: "",
    name: "",
    kind: "webhook",
    target: "personal",
    mode: "observe" as GateMode,
    senders: "",
    bots: "",
    enabled: true,
    error: "",
  })

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const invalid = sourceError(s.key.trim(), s.name)
    set("error", invalid)
    if (invalid) return
    void c.perform(async () => {
      await operation(c, {
        action: "channels.source",
        source_key: s.key.trim(),
        name: s.name.trim(),
        kind: s.kind.trim() || "webhook",
        enabled: s.enabled,
        target: s.target.trim() || "personal",
        accept_mode: s.mode,
        allowed_senders: parseList(s.senders),
        allowed_bots: parseList(s.bots),
      })
      c.notice("Channel source saved.")
      props.close()
      await props.saved()
    })
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup
          title="Add channel source"
          description="Register an external event source and its intake gate."
        />
      </DialogHeader>
      <DialogBody>
        <form onSubmit={submit}>
          <Show when={s.error}>
            <p role="alert">{s.error}</p>
          </Show>
          <Show when={c.state.error}>
            <p role="alert">{c.state.error}</p>
          </Show>
          <FieldRow label="Source key">
            <input
              required
              placeholder="webhook:github"
              value={s.key}
              onInput={(e) => set("key", e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Display name">
            <input required value={s.name} onInput={(e) => set("name", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Kind">
            <input value={s.kind} onInput={(e) => set("kind", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Target agent">
            <input value={s.target} onInput={(e) => set("target", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Initial gate mode">
            <select value={s.mode} onChange={(e) => set("mode", e.currentTarget.value as GateMode)}>
              <option value="observe">Observe (audit only, 0 tokens)</option>
              <option value="auto">Auto (wake target agent)</option>
              <option value="off">Off</option>
            </select>
          </FieldRow>
          <FieldRow label="Allowed senders">
            <input
              placeholder="Comma separated sender ids"
              value={s.senders}
              onInput={(e) => set("senders", e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Allowed bots">
            <input
              placeholder="Comma separated bot ids"
              value={s.bots}
              onInput={(e) => set("bots", e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Enabled">
            <input type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.currentTarget.checked)} />
          </FieldRow>
          <div class="nexus-actions">
            <Button type="submit" disabled={c.state.busy}>
              Save source
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

function SimulateDialog(props: {
  client: ManagementClient
  sources: Source[]
  close(): void
  done(summary: string): void
}) {
  const c = props.client

  const [s, set] = createStore({
    source: props.sources[0]?.source_key ?? "",
    external: "evt-" + Date.now(),
    thread: "thread-1",
    text: "",
    addressed: true,
  })

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    void c.perform(async () => {
      const result = await operation<{ outcome?: string; strength?: string }>(c, {
        action: "channels.ingest",
        source_key: s.source.trim(),
        external_id: s.external.trim(),
        thread_key: s.thread.trim(),
        text: s.text,
        addressed: s.addressed,
      })
      props.done(ingestSummary(result))
      props.close()
    })
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup
          title="Simulate incoming event"
          description="Send a synthetic event through the gate to verify observe and auto rules."
        />
      </DialogHeader>
      <DialogBody>
        <form onSubmit={submit}>
          <Show when={c.state.error}>
            <p role="alert">{c.state.error}</p>
          </Show>
          <FieldRow label="Source key">
            <input
              required
              list="nexus-channel-sources"
              value={s.source}
              onInput={(e) => set("source", e.currentTarget.value)}
            />
            <datalist id="nexus-channel-sources">
              <For each={props.sources}>{(source) => <option value={source.source_key} />}</For>
            </datalist>
          </FieldRow>
          <FieldRow label="External event id">
            <input required value={s.external} onInput={(e) => set("external", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="External thread key">
            <input required value={s.thread} onInput={(e) => set("thread", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Event text">
            <textarea
              required
              rows={4}
              placeholder="e.g. Cloud vendor invoice #2026-11 ($1,280) arrived and needs approval."
              value={s.text}
              onInput={(e) => set("text", e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Addressed to the agent">
            <input
              type="checkbox"
              checked={s.addressed}
              onChange={(e) => set("addressed", e.currentTarget.checked)}
            />
          </FieldRow>
          <div class="nexus-actions">
            <Button type="submit" disabled={c.state.busy}>
              Send event
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
