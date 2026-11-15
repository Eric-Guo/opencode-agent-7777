import { For, Show, Switch, Match, createEffect, onCleanup, on } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import type { WorkspaceSummary } from "@cybros/agent"
import type { ChatController } from "../nexus/controller"
import { createManagementClient } from "./client"
import { createModuleHost } from "./modules"
import { SlotView } from "./slot"
import { Bots } from "./bots"
import { Presets } from "./presets"
import { Plugins } from "./plugins"
import { Schedules } from "./schedules"
import { Settings } from "./settings"
import { Integrations } from "./integrations"
import { Providers } from "./providers"
import { Terminals } from "./terminals"
import { ModuleContext } from "./context"
import type { JSX } from "solid-js"
import { Updates } from "./updates"
import { FieldRow } from "./fields"
import modelConfig from "../providers/models/default-config.json"
import "./management.css"

export function Management(props: { chat: ChatController; children: JSX.Element }) {
  const client = createManagementClient(props.chat)

  const [s, set] = createStore({
    page: "",
    workspaces: [] as WorkspaceSummary[],
    name: "",
    key: crypto.randomUUID(),
    terminal: null as { run: string; task: string } | null,
  })

  const host = createModuleHost(client, (page) => set("page", page))

  const refresh = async () => {
    const scope = client.scope()
    const workspaces = await client.command<{ items: WorkspaceSummary[] }>({ action: "workspace.list" })

    if (scope !== client.scope()) return
    set("workspaces", workspaces.items)
    await host.refresh()
  }

  createEffect(
    on(client.scope, (scope) => {
      host.close()
      set({ page: "", terminal: null })

      if (scope) void client.perform(refresh)
    }),
  )
  onCleanup(host.close)

  const open = (workspace: string, conversation: string) => {
    set("page", "")
    void props.chat.connect(workspace, conversation)
  }

  return (
    <ModuleContext.Provider
      value={{
        host,
        terminal: (target) => {
          set({ page: "Terminals", terminal: target })
        },
      }}
    >
      <nav class="nexus-management-bar" aria-label="Nexus administration">
        <Show when={props.chat.s.connection}>
          <select
            aria-label="Workspace"
            value={client.workspace()}
            disabled={props.chat.s.connecting || props.chat.s.sending}
            onChange={(event) => {
              void props.chat.connect(event.currentTarget.value)
            }}
          >
            <For each={s.workspaces}>
              {(row) => (
                <option value={row.public_id} selected={row.public_id === client.workspace()}>
                  {row.name}
                </option>
              )}
            </For>
          </select>
          <For
            each={[
              "Workspaces",
              "Bots",
              "Presets",
              "Schedules",
              "Plugins",
              "Integrations",
              "Terminals",
              ...(modelConfig.manageModels ? ["Providers"] : []),
              "Updates",
            ]}
          >
            {(label) => (
              <Button size="small" onClick={() => set("page", label)}>
                {label}
              </Button>
            )}
          </For>
          <For each={host.entries("sidebar.panellist")}>
            {(entry) => (
              <Button size="small" onClick={() => set("page", entry.id)}>
                {entry.label}
              </Button>
            )}
          </For>
          <SlotView
            host={host}
            slot="conversation.header.utilities"
            values={{ conversation: props.chat.s.id, workspace: client.workspace(), open }}
          />
        </Show>
        <Button size="small" onClick={() => set("page", "Settings")}>
          Settings & account
        </Button>
      </nav>
      <Show when={s.page}>
        <div
          class="nexus-management"
          role="dialog"
          aria-modal="true"
          aria-label={s.page}
          onKeyDown={(event) => {
            if (event.key === "Escape") set("page", "")
          }}
        >
          <header>
            <h2>{s.page}</h2>
            <Button class="ml-auto" onClick={() => set("page", "")}>
              Back to conversation
            </Button>
          </header>
          <div class="nexus-management-body">
            <Show when={client.state.error}>
              <p class="nexus-error" role="alert">
                {client.state.error}
              </p>
            </Show>
            <Show when={client.state.notice}>
              <p role="status">{client.state.notice}</p>
            </Show>
            <Switch
              fallback={
                <SlotView
                  host={host}
                  slot="main"
                  id={s.page}
                  values={{ conversation: props.chat.s.id, workspace: client.workspace(), open }}
                />
              }
            >
              <Match when={s.page === "Settings"}>
                <Settings client={client} host={host} />
              </Match>
              <Match when={s.page === "Bots"}>
                <Bots client={client} host={host} open={open} />
              </Match>
              <Match when={s.page === "Presets"}>
                <Presets client={client} />
              </Match>
              <Match when={s.page === "Schedules"}>
                <Schedules client={client} open={open} />
              </Match>
              <Match when={s.page === "Plugins"}>
                <Plugins client={client} host={host} />
              </Match>
              <Match when={s.page === "Integrations"}>
                <Integrations client={client} />
              </Match>
              <Match when={s.page === "Providers"}>
                <Providers client={client} />
              </Match>
              <Match when={s.page === "Terminals"}>
                <Terminals client={client} target={s.terminal ?? undefined} />
              </Match>
              <Match when={s.page === "Updates"}>
                <Updates client={client} />
              </Match>
              <Match when={s.page === "Workspaces"}>
                <section>
                  <h2>Workspaces</h2>
                  <p>The default applies to new conversations. Existing conversations retain their workspace.</p>
                  <For each={s.workspaces}>
                    {(row) => (
                      <div class="nexus-card">
                        <h3>{row.name}</h3>
                        <small>{row.dedicated ? "Dedicated to this agent" : "Shared workspace"}</small>
                        <div class="nexus-actions">
                          <Button
                            onClick={() => {
                              set("page", "")
                              void props.chat.connect(row.public_id)
                            }}
                          >
                            Open workspace
                          </Button>
                          <Button
                            disabled={client.state.busy}
                            onClick={() =>
                              void client.perform(async () => {
                                await client.command({ action: "workspace.use", workspace: row.public_id })
                                client.notice("Default workspace saved.")
                              })
                            }
                          >
                            Use as default
                          </Button>
                        </div>
                      </div>
                    )}
                  </For>
                  <form
                    class="nexus-card"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void client.perform(async () => {
                        await client.command({ action: "workspace.create", name: s.name, key: s.key })
                        set({ name: "", key: crypto.randomUUID() })
                        await refresh()
                      })
                    }}
                  >
                    <FieldRow label="New dedicated workspace">
                      <input
                        required
                        value={s.name}
                        onInput={(e) => set({ name: e.currentTarget.value, key: crypto.randomUUID() })}
                      />
                    </FieldRow>
                    <Button type="submit" disabled={client.state.busy}>
                      Create workspace
                    </Button>
                  </form>
                </section>
              </Match>
            </Switch>
          </div>
        </div>
      </Show>
      {props.children}
      <div class="nexus-module-dock">
        <SlotView
          host={host}
          slot="dock.tab"
          values={{ conversation: props.chat.s.id, workspace: client.workspace(), open }}
        />
      </div>
    </ModuleContext.Provider>
  )
}
