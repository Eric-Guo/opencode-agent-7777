import { For, Show, Switch, Match, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Schema } from "effect"
import type { Nexus } from "@opencode/schema/nexus"
import type { NamedAgent } from "@cybros/agent"
import type { ManagementClient } from "./client"
import { FieldRow, ConfigurationForm } from "./fields"

export function Integrations(props: { client: ManagementClient }) {
  const c = props.client
  const [s, set] = createStore({ selected: "nexus.ingress-telegram", rows: [] as Nexus.Extension[] })
  const refresh = async () => set("rows", await c.command<Nexus.Extension[]>({ action: "extension.list" }))
  onMount(() => void c.perform(refresh))

  return (
    <section>
      <h2>Integrations</h2>
      <div class="nexus-actions">
        <For
          each={[
            ["nexus.ingress-telegram", "Telegram"],
            ["nexus.mcp", "MCP"],
            ["nexus.t3", "T3"],
          ]}
        >
          {([id, label]) => <Button onClick={() => set("selected", id)}>{label}</Button>}
        </For>
        <Button onClick={() => void c.perform(refresh)}>Refresh</Button>
      </div>
      <Show when={s.rows.find((row) => row.id === s.selected)} keyed>
        {(row) => (
          <>
            <div class="nexus-card">
              <h3>{row.name}</h3>
              <p>{row.description}</p>
              <For each={row.diagnostics}>{(text) => <p role="alert">{text}</p>}</For>
              <Button
                disabled={c.state.busy}
                onClick={() =>
                  void c.perform(async () => {
                    await c.command({ action: "extension.configure", change: { id: row.id, enabled: !row.enabled } })
                    await refresh()
                  })
                }
              >
                {row.enabled ? "Disable" : "Enable"}
              </Button>
              <details>
                <summary>Runtime configuration</summary>
                <ConfigurationForm
                  schema={row.configuration_schema}
                  values={row.configuration}
                  busy={c.state.busy}
                  save={(operations) =>
                    c.perform(async () => {
                      await c.command({ action: "extension.configure", change: { id: row.id, operations } })
                      await refresh()
                    })
                  }
                />
              </details>
            </div>
            <Show when={row.active}>
              <Switch>
                <Match when={row.id === "nexus.ingress-telegram"}>
                  <Telegram client={c} configuration={row.configuration} />
                </Match>
                <Match when={row.id === "nexus.mcp"}>
                  <Mcp client={c} />
                </Match>
                <Match when={row.id === "nexus.t3"}>
                  <T3 client={c} />
                </Match>
              </Switch>
            </Show>
          </>
        )}
      </Show>
    </section>
  )
}

type Connection = { id: string; name: string; enabled: boolean; token_present: boolean }

const Binding = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  connection_public_id: Schema.optional(Schema.NullOr(Schema.String)),
  target: Schema.optional(
    Schema.NullOr(Schema.Struct({ chat_id: Schema.String, topic_id: Schema.optional(Schema.NullOr(Schema.Number)) })),
  ),
  owner_id: Schema.optional(Schema.NullOr(Schema.String)),
  stale_after: Schema.optional(Schema.Number),
  input_debounce_seconds: Schema.optional(Schema.Number),
  transcription_model: Schema.optional(Schema.String),
  speech_model: Schema.optional(Schema.String),
})

function Telegram(props: { client: ManagementClient; configuration: Record<string, Schema.Json> }) {
  const c = props.client

  const [s, set] = createStore({
    connections: [] as Connection[],
    bots: [] as NamedAgent[],
    id: "",
    name: "Telegram",
    token: "",
    clear: false,
    enabled: true,
    bot: "",
    connection: "",
    chat: "",
    topic: "",
    owner: "",
    active: false,
    stale: 600,
    debounce: 2,
    transcription: "",
    speech: "",
    access: {} as Record<string, string[]>,
    list: "allowed_users",
    value: "",
    output: "",
    deliveries: [] as { id: string; status: string; kind: string; chat: string }[],
  })

  const invoke = <T,>(action: string, input: Record<string, Schema.Json> = {}) =>
    c.extension<T>(action, { action, ...input })

  const refresh = async () => {
    set("connections", await invoke<Connection[]>("telegram.connections"))
    set("bots", await c.command<NamedAgent[]>({ action: "bot.list" }))
  }

  onMount(() => void c.perform(refresh))

  const select = (id: string) => {
    const bindings = Schema.decodeUnknownSync(Schema.Record(Schema.String, Binding))(props.configuration.bots ?? {})
    const row = bindings[id]
    set({
      bot: id,
      connection: row?.connection_public_id ?? "",
      chat: row?.target?.chat_id ?? "",
      topic: String(row?.target?.topic_id ?? ""),
      owner: row?.owner_id ?? "",
      active: row?.enabled ?? false,
      stale: row?.stale_after ?? 600,
      debounce: row?.input_debounce_seconds ?? 2,
      transcription: row?.transcription_model ?? "",
      speech: row?.speech_model ?? "",
      access: {},
      deliveries: [],
    })
  }

  return (
    <>
      <div class="nexus-card">
        <h3>Telegram Connections</h3>
        <For each={s.connections}>
          {(row) => (
            <div class="nexus-actions">
              <span>
                {row.name} · {row.token_present ? "Token saved" : "No token"}
              </span>
              <Button
                onClick={() => set({ id: row.id, name: row.name, enabled: row.enabled, token: "", clear: false })}
              >
                Edit
              </Button>
              <Button
                onClick={() =>
                  void c.perform(async () =>
                    set("output", JSON.stringify(await invoke("telegram.connection.check", { id: row.id }), null, 2)),
                  )
                }
              >
                Check token
              </Button>
              <Button
                onClick={() =>
                  void c.perform(async () => {
                    await invoke("telegram.connection.remove", { id: row.id })
                    await refresh()
                  })
                }
              >
                Remove
              </Button>
            </div>
          )}
        </For>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void c.perform(async () => {
              await invoke("telegram.connection.save", {
                ...(s.id ? { id: s.id } : {}),
                name: s.name,
                enabled: s.enabled,
                ...(s.clear ? { token: null } : s.token ? { token: s.token } : {}),
              })
              set({ id: "", token: "", clear: false })
              await refresh()
            })
          }}
        >
          <FieldRow label="Connection name">
            <input required value={s.name} onInput={(e) => set("name", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="BotFather token">
            <input
              type="password"
              autocomplete="new-password"
              placeholder="Keep saved token"
              value={s.token}
              onInput={(e) => set("token", e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Clear saved token">
            <input type="checkbox" checked={s.clear} onChange={(e) => set("clear", e.currentTarget.checked)} />
          </FieldRow>
          <FieldRow label="Enabled">
            <input type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.currentTarget.checked)} />
          </FieldRow>
          <Button type="submit" disabled={c.state.busy}>
            Save Connection
          </Button>
          <Button onClick={() => set({ id: "", name: "Telegram", token: "", clear: false, enabled: true })}>
            New Connection
          </Button>
        </form>
        <Show when={s.output}>
          <pre>{s.output}</pre>
        </Show>
      </div>
      <div class="nexus-card">
        <h3>Bot routing and access</h3>
        <FieldRow label="Bot">
          <select value={s.bot} onChange={(e) => select(e.currentTarget.value)}>
            <option value="">Choose a Bot</option>
            <For each={s.bots}>{(row) => <option value={row.public_id}>{row.display_name || row.name}</option>}</For>
          </select>
        </FieldRow>
        <Show when={s.bot}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void c.perform(async () => {
                await invoke("telegram.bot.configure", {
                  id: s.bot,
                  configuration: {
                    enabled: s.active,
                    connection_public_id: s.connection || null,
                    target: s.chat ? { chat_id: s.chat, topic_id: s.topic ? Number(s.topic) : null } : null,
                    owner_id: s.owner || null,
                    stale_after: s.stale,
                    input_debounce_seconds: s.debounce,
                    transcription_model: s.transcription,
                    speech_model: s.speech,
                  },
                })
                c.notice("Telegram routing saved.")
              })
            }}
          >
            <FieldRow label="Connection">
              <select value={s.connection} onChange={(e) => set("connection", e.currentTarget.value)}>
                <option value="">None</option>
                <For each={s.connections}>{(row) => <option value={row.id}>{row.name}</option>}</For>
              </select>
            </FieldRow>
            <For
              each={
                [
                  ["chat", "Chat ID"],
                  ["topic", "Topic ID (optional)"],
                  ["owner", "Owner Telegram user ID"],
                  ["transcription", "Transcription model"],
                  ["speech", "Speech model"],
                ] as const
              }
            >
              {([key, label]) => (
                <FieldRow label={label}>
                  <input value={s[key]} onInput={(e) => set(key, e.currentTarget.value)} />
                </FieldRow>
              )}
            </For>
            <FieldRow label="Enabled">
              <input type="checkbox" checked={s.active} onChange={(e) => set("active", e.currentTarget.checked)} />
            </FieldRow>
            <FieldRow label="Discard messages older than (seconds)">
              <input
                type="number"
                min={1}
                value={s.stale}
                onInput={(e) => set("stale", e.currentTarget.valueAsNumber)}
              />
            </FieldRow>
            <FieldRow label="Input debounce (seconds)">
              <input
                type="number"
                min={0}
                max={10}
                value={s.debounce}
                onInput={(e) => set("debounce", e.currentTarget.valueAsNumber)}
              />
            </FieldRow>
            <Button type="submit" disabled={c.state.busy}>
              Save routing
            </Button>
          </form>
          <div class="nexus-actions">
            <Button
              onClick={() => void c.perform(async () => set("access", await invoke("telegram.access", { id: s.bot })))}
            >
              Read access lists
            </Button>
            <Button
              onClick={() =>
                void c.perform(async () => set("deliveries", await invoke("telegram.deliveries", { id: s.bot })))
              }
            >
              Delivery status
            </Button>
          </div>
          <For each={Object.entries(s.access)}>
            {([name, rows]) => (
              <p>
                {name}: {rows.join(", ")}
              </p>
            )}
          </For>
          <FieldRow label="Access list">
            <select value={s.list} onChange={(e) => set("list", e.currentTarget.value)}>
              <option>allowed_users</option>
              <option>allowed_chats</option>
              <option>ignored_users</option>
            </select>
          </FieldRow>
          <FieldRow label="Telegram ID">
            <input value={s.value} onInput={(e) => set("value", e.currentTarget.value)} />
          </FieldRow>
          <div class="nexus-actions">
            <For each={["add", "remove"]}>
              {(operation) => (
                <Button
                  disabled={c.state.busy || !s.value}
                  onClick={() =>
                    void c.perform(async () =>
                      set(
                        "access",
                        await invoke("telegram.access", { id: s.bot, list: s.list, operation, value: s.value }),
                      ),
                    )
                  }
                >
                  {operation}
                </Button>
              )}
            </For>
          </div>
          <For each={s.deliveries}>
            {(row) => (
              <p>
                {row.kind} · {row.chat} · {row.status}
                <Show when={["uncertain", "refused"].includes(row.status)}>
                  <Button
                    disabled={c.state.busy}
                    onClick={() =>
                      void c.perform(async () => {
                        await invoke("telegram.delivery.retry", { id: s.bot, delivery: row.id })
                        set("deliveries", await invoke("telegram.deliveries", { id: s.bot }))
                      })
                    }
                  >
                    Retry delivery
                  </Button>
                </Show>
              </p>
            )}
          </For>
        </Show>
      </div>
    </>
  )
}

function Mcp(props: { client: ManagementClient }) {
  const c = props.client

  const [s, set] = createStore({
    rows: [] as {
      server: string
      tools?: { name: string }[]
      documents?: { name: string }[]
      diagnostics?: string[]
    }[],
    server: "",
    attempt: "",
    code: "",
    output: "",
    url: "",
  })

  const refresh = async () => set("rows", await c.extension("mcp.list"))
  onMount(() => void c.perform(refresh))

  return (
    <div class="nexus-card">
      <h3>MCP servers</h3>
      <For each={s.rows}>
        {(row) => (
          <div class="nexus-card">
            <h3>{row.server}</h3>
            <p>Tools: {(row.tools ?? []).map((tool) => tool.name).join(", ")}</p>
            <p>Documents: {(row.documents ?? []).map((document) => document.name).join(", ")}</p>
            <div class="nexus-actions">
              <For each={["probe", "enable", "disable", "login", "logout"]}>
                {(action) => (
                  <Button
                    disabled={c.state.busy}
                    onClick={() =>
                      void c.perform(async () => {
                        const result = await c.extension<{ attemptID?: string; url?: string }>("mcp." + action, {
                          server: row.server,
                        })

                        set({
                          server: row.server,
                          output: JSON.stringify(result, null, 2),
                          attempt: result.attemptID ?? "",
                          url: result.url ?? "",
                        })

                        if (action !== "login") await refresh()
                      })
                    }
                  >
                    {action}
                  </Button>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
      <Show when={s.url}>
        <a href={s.url} target="_blank" rel="noreferrer">
          Authorize MCP server
        </a>
      </Show>
      <Show when={s.attempt}>
        <FieldRow label="Authorization code">
          <input value={s.code} onInput={(e) => set("code", e.currentTarget.value)} />
        </FieldRow>
        <div class="nexus-actions">
          <For each={[false, true]}>
            {(cancel) => (
              <Button
                disabled={c.state.busy}
                onClick={() =>
                  void c.perform(async () => {
                    await c.extension("mcp.login", { server: s.server, attempt: s.attempt, code: s.code, cancel })
                    set({ attempt: "", code: "", url: "" })
                    await refresh()
                  })
                }
              >
                {cancel ? "Cancel login" : "Complete login"}
              </Button>
            )}
          </For>
        </div>
      </Show>
      <Show when={s.output}>
        <pre>{s.output}</pre>
      </Show>
    </div>
  )
}

function T3(props: { client: ManagementClient }) {
  const c = props.client

  const [s, set] = createStore({
    projects: [] as { id: string; title: string; workspaceRoot: string }[],
    path: "",
    token: "",
    provider: "",
    apiKey: "",
    login: "",
    output: "",
  })

  const invoke = (action: string, input: Record<string, Schema.Json> = {}) => c.extension(action, { action, ...input })

  const show = async (action: string, input?: Record<string, Schema.Json>) =>
    set("output", JSON.stringify(await invoke(action, input), null, 2))

  return (
    <div class="nexus-card">
      <h3>T3 service</h3>
      <div class="nexus-actions">
        <For each={["status", "check", "agents"]}>
          {(action) => (
            <Button disabled={c.state.busy} onClick={() => void c.perform(() => show("t3." + action))}>
              {action}
            </Button>
          )}
        </For>
        <Button
          onClick={() =>
            void c.perform(async () => set("projects", await c.extension("t3.projects", { action: "t3.projects" })))
          }
        >
          List projects
        </Button>
      </div>
      <For each={s.projects}>
        {(row) => (
          <p>
            {row.title} · {row.workspaceRoot}
            <Button onClick={() => void c.perform(() => show("t3.project", { id: row.id }))}>Use project</Button>
          </p>
        )}
      </For>
      <FieldRow label="Project root on the T3 host">
        <input value={s.path} onInput={(e) => set("path", e.currentTarget.value)} />
      </FieldRow>
      <Button
        disabled={c.state.busy || !s.path}
        onClick={() => void c.perform(() => show("t3.create", { path: s.path }))}
      >
        Create or adopt project
      </Button>
      <FieldRow label="Bearer token (leave empty to issue on a local service)">
        <input
          type="password"
          autocomplete="new-password"
          value={s.token}
          onInput={(e) => set("token", e.currentTarget.value)}
        />
      </FieldRow>
      <Button
        disabled={c.state.busy}
        onClick={() =>
          void c.perform(async () => {
            await show("t3.token", s.token ? { token: s.token } : {})
            set("token", "")
          })
        }
      >
        Save token
      </Button>
      <FieldRow label="Provider for native login">
        <input value={s.provider} onInput={(e) => set("provider", e.currentTarget.value)} />
      </FieldRow>
      <FieldRow label="API key (optional)">
        <input
          type="password"
          autocomplete="new-password"
          value={s.apiKey}
          onInput={(e) => set("apiKey", e.currentTarget.value)}
        />
      </FieldRow>
      <Button
        disabled={c.state.busy || !s.provider}
        onClick={() =>
          void c.perform(async () => {
            const result = await c.extension<{ id?: string }>("t3.login", {
              action: "t3.login",
              provider: s.provider,
              ...(s.apiKey ? { api_key: s.apiKey } : {}),
            })

            set({ apiKey: "", login: result.id ?? "", output: JSON.stringify(result, null, 2) })
          })
        }
      >
        Start native login
      </Button>
      <Show when={s.login}>
        <Button onClick={() => void c.perform(() => show("t3.login", { id: s.login }))}>Check login</Button>
      </Show>
      <Show when={s.output}>
        <pre>{s.output}</pre>
      </Show>
    </div>
  )
}
