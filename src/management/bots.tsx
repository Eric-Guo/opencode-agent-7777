import { For, Show, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import type { NamedAgent, Conversation, WorkspaceSummary, Turn, TurnPage } from "@cybros/agent"
import { NexusBot } from "@opencode/schema/nexus-bot"
import { NexusPreset } from "@opencode/schema/nexus-preset"
import type { ManagementClient } from "./client"
import type { ModuleHost } from "./modules"
import { SlotView } from "./slot"
import { FieldRow } from "./fields"

type Bot = NamedAgent & {
  settings: NexusBot.Settings
  current: { public_id: string; workspace_public_id: string } | null
}

export function Bots(props: {
  client: ManagementClient
  host: ModuleHost
  open(workspace: string, conversation: string): void
}) {
  const c = props.client

  const [s, set] = createStore({
    rows: [] as Bot[],
    presets: [] as NexusPreset.Entry[],
    workspaces: [] as WorkspaceSummary[],
    id: "",
    name: "",
    display: "",
    description: "",
    audience: "owner" as "owner" | "external",
    preset: "",
    home: "",
    subagent: true,
    welcome: "default",
    message: "",
    key: crypto.randomUUID(),
    history: [] as Conversation[],
    historyNext: null as string | null,
    historyVisible: false,
    archived: true,
    fork: null as Conversation | null,
    turns: [] as Turn[],
    before: null as number | null,
  })

  const refresh = async () => set("rows", await c.command<Bot[]>({ action: "bot.list" }))

  const history = async (after?: string) => {
    const page = await c.command<{ items: Conversation[]; next_after: string | null }>({
      action: "bot.history",
      id: s.id,
      archived: s.archived,
      after,
    })

    set({
      history: after ? [...s.history, ...page.items] : page.items,
      historyNext: page.next_after,
      historyVisible: true,
    })
  }

  const turns = async (row: Conversation, before = 2147483647) => {
    const page = await c.command<TurnPage>({
      action: "application.operation",
      workspace: row.workspace_public_id,
      operation: { action: "turns", conversation: row.public_id, before_position: before, limit: 36 },
    })

    set({ fork: row, turns: page.items, before: page.items.length ? page.before_position : null })
  }

  onMount(
    () =>
      void c.perform(async () => {
        await refresh()

        const [presets, spaces] = await Promise.all([
          c.command<NexusPreset.Catalog>({ action: "preset.list" }),
          c.command<{ items: WorkspaceSummary[] }>({ action: "workspace.list" }),
        ])

        set({ presets: [...presets.presets], workspaces: spaces.items, preset: presets.default_bot_preset_public_id })
      }),
  )

  const edit = (bot: Bot) =>
    set({
      id: bot.public_id,
      name: bot.name.replace(/^bot-/, ""),
      display: bot.display_name ?? "",
      description: bot.description,
      audience: bot.settings.audience,
      preset: bot.settings.preset_public_id,
      home: bot.settings.home_workspace_public_id ?? "",
      subagent: bot.settings.subagent,
      welcome: bot.settings.welcome_message === null ? "default" : bot.settings.welcome_message ? "custom" : "none",
      message: bot.settings.welcome_message ?? "",
      history: [],
      historyVisible: false,
      fork: null,
      key: crypto.randomUUID(),
    })

  return (
    <section>
      <h2>Bots</h2>
      <div class="nexus-actions">
        <Button onClick={() => void c.perform(refresh)}>Refresh</Button>
        <Button
          onClick={() =>
            set({
              id: "",
              name: "",
              display: "",
              description: "",
              home: "",
              subagent: true,
              audience: "owner",
              welcome: "default",
              message: "",
            })
          }
        >
          New Bot
        </Button>
      </div>
      <For each={s.rows}>
        {(bot) => (
          <div class="nexus-card">
            <h3>{bot.display_name || bot.name}</h3>
            <p>{bot.description}</p>
            <small>{s.presets.find((preset) => preset.public_id === bot.settings.preset_public_id)?.name}</small>
            <div class="nexus-actions">
              <Button onClick={() => edit(bot)}>Edit</Button>
              <Show when={bot.current}>
                <Button onClick={() => props.open(bot.current!.workspace_public_id, bot.current!.public_id)}>
                  Open current conversation
                </Button>
              </Show>
              <Button
                disabled={c.state.busy}
                onClick={() =>
                  void c.perform(async () => {
                    const result = await c.command<{ selected: { public_id: string; workspace_public_id: string } }>({
                      action: "bot.new",
                      id: bot.public_id,
                      key: s.key,
                    })

                    set("key", crypto.randomUUID())
                    await refresh()
                    props.open(result.selected.workspace_public_id, result.selected.public_id)
                  })
                }
              >
                New conversation
              </Button>
              <Button
                onClick={() =>
                  void c.perform(async () => {
                    edit(bot)
                    await history()
                  })
                }
              >
                History
              </Button>
              <Button
                onClick={() =>
                  void c.perform(async () => {
                    await c.command({
                      action: "bot.duplicate",
                      id: bot.public_id,
                      name: bot.name.replace(/^bot-/, "") + "-copy",
                      audience: "owner",
                    })
                    await refresh()
                  })
                }
              >
                Duplicate as personal Bot
              </Button>
            </div>
          </div>
        )}
      </For>
      <Show when={s.historyVisible}>
        <div class="nexus-card">
          <h3>Conversation history</h3>
          <label>
            <input
              type="checkbox"
              checked={s.archived}
              onChange={(event) => {
                set("archived", event.currentTarget.checked)
                void c.perform(() => history())
              }}
            />
            Include archived conversations
          </label>
          <For each={s.history}>
            {(row) => (
              <div class="nexus-actions">
                <span>
                  {row.title || row.public_id}
                  {row.archived_at ? " · Archived" : ""}
                </span>
                <Button onClick={() => props.open(row.workspace_public_id, row.public_id)}>Open</Button>
                <Button
                  disabled={row.workspace_public_id !== c.workspace()}
                  onClick={() => void c.perform(() => turns(row))}
                >
                  Choose reply to fork
                </Button>
                <Button
                  onClick={() =>
                    void c.perform(async () => {
                      const result = await c.command<{ selected: { public_id: string; workspace_public_id: string } }>({
                        action: "bot.resume",
                        id: s.id,
                        workspace: row.workspace_public_id,
                        conversation: row.public_id,
                        key: s.key,
                      })

                      set("key", crypto.randomUUID())
                      await refresh()
                      props.open(result.selected.workspace_public_id, result.selected.public_id)
                    })
                  }
                >
                  Resume
                </Button>
              </div>
            )}
          </For>
          <Show when={s.historyNext}>
            <Button onClick={() => void c.perform(() => history(s.historyNext!))}>Load older conversations</Button>
          </Show>
        </div>
      </Show>
      <Show when={s.fork}>
        {(row) => (
          <div class="nexus-card">
            <h3>Fork from a reply</h3>
            <For each={s.turns.filter((turn) => turn.active_variant && turn.role === "assistant" && !turn.reference)}>
              {(turn) => (
                <div class="nexus-actions">
                  <span>
                    {turn.position}:{" "}
                    {turn.active_variant?.content_preview ||
                      turn.active_variant?.content?.slice(0, 160) ||
                      turn.public_id}
                  </span>
                  <Button
                    disabled={c.state.busy}
                    onClick={() =>
                      void c.perform(async () => {
                        const result = await c.command<{
                          selected: { workspace_public_id: string; public_id: string }
                        }>({
                          action: "bot.fork",
                          id: s.id,
                          key: s.key,
                          workspace: row().workspace_public_id,
                          conversation: row().public_id,
                          turn: turn.public_id,
                          variant: turn.active_variant!.public_id,
                        })

                        set("key", crypto.randomUUID())
                        props.open(result.selected.workspace_public_id, result.selected.public_id)
                      })
                    }
                  >
                    Fork this reply
                  </Button>
                </div>
              )}
            </For>
            <Show when={s.before}>
              <Button onClick={() => void c.perform(() => turns(row(), s.before!))}>Earlier replies</Button>
            </Show>
          </div>
        )}
      </Show>
      <form
        class="nexus-card"
        onSubmit={(event) => {
          event.preventDefault()
          void c.perform(async () => {
            const settings = {
              audience: s.audience,
              preset_public_id: s.preset,
              home_workspace_public_id: s.home || null,
              subagent: s.subagent,
              welcome_message: s.welcome === "default" ? null : s.welcome === "none" ? "" : s.message,
            }

            const row = await c.command<Bot>(
              s.id
                ? { action: "bot.configure", id: s.id, display_name: s.display, description: s.description, settings }
                : { action: "bot.create", name: s.name, display_name: s.display, description: s.description, settings },
            )

            await refresh()
            const saved = s.rows.find((item) => item.public_id === row.public_id)

            if (saved) edit(saved)
          })
        }}
      >
        <h3>{s.id ? "Edit Bot" : "Create Bot"}</h3>
        <fieldset disabled={c.state.busy}>
          <FieldRow label="Stable name">
            <input
              required
              disabled={!!s.id}
              value={s.name}
              pattern="[a-z0-9][a-z0-9_-]*"
              onInput={(e) => set("name", e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Display name">
            <input value={s.display} onInput={(e) => set("display", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Description">
            <textarea required value={s.description} onInput={(e) => set("description", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Audience">
            <select value={s.audience} onChange={(e) => set("audience", e.currentTarget.value as typeof s.audience)}>
              <option value="owner">Personal</option>
              <option value="external">External</option>
            </select>
          </FieldRow>
          <FieldRow label="Preset">
            <select value={s.preset} onChange={(e) => set("preset", e.currentTarget.value)}>
              <For each={s.presets}>{(preset) => <option value={preset.public_id}>{preset.name}</option>}</For>
            </select>
          </FieldRow>
          <FieldRow label="Home Workspace">
            <select value={s.home} onChange={(e) => set("home", e.currentTarget.value)}>
              <option value="">No home; disable new conversations</option>
              <For each={s.workspaces}>{(space) => <option value={space.public_id}>{space.name}</option>}</For>
            </select>
          </FieldRow>
          <FieldRow label="Subagent">
            <input type="checkbox" checked={s.subagent} onChange={(e) => set("subagent", e.currentTarget.checked)} />
          </FieldRow>
          <FieldRow label="Introduction">
            <select value={s.welcome} onChange={(e) => set("welcome", e.currentTarget.value)}>
              <option value="default">Default introduction</option>
              <option value="custom">Custom introduction</option>
              <option value="none">No introduction</option>
            </select>
          </FieldRow>
          <Show when={s.welcome === "custom"}>
            <textarea
              aria-label="Welcome message"
              value={s.message}
              onInput={(e) => set("message", e.currentTarget.value)}
            />
          </Show>
          <Button type="submit">Save Bot</Button>
        </fieldset>
      </form>
      <Show when={s.id}>
        <SlotView
          host={props.host}
          slot="bots.item.config"
          values={{ bot: s.rows.find((row) => row.public_id === s.id), refresh }}
        />
        <details class="nexus-card">
          <summary>Remove Bot</summary>
          <p>This removes the Bot identity separately from its Preset.</p>
          <Button
            disabled={c.state.busy}
            onClick={() =>
              void c.perform(async () => {
                await c.command({ action: "bot.remove", id: s.id })
                set("id", "")
                await refresh()
              })
            }
          >
            Confirm removal
          </Button>
        </details>
      </Show>
    </section>
  )
}
