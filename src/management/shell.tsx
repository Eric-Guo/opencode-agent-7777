import { For, Show, Switch, Match, createEffect, onCleanup, on } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import type { WorkspaceSummary } from "@cybros/agent"
import type { Navigation } from "../nexus/navigation"
import type { ChatController } from "../nexus/controller"
import { isElectronUserAgent } from "../runtime/platform/platform-bridge"
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
import { Inbox } from "./inbox"
import { Routines } from "./routines"
import { Channels } from "./channels"
import { Knowledge } from "./knowledge"
import { ModuleContext } from "./context"
import type { JSX } from "solid-js"
import { Updates } from "./updates"
import { FieldRow } from "./fields"
import modelConfig from "../providers/models/default-config.json"
import "./management.css"

export function Management(props: { chat: ChatController; navigation: Navigation; children: JSX.Element }) {
  const client = createManagementClient(props.chat)
  const windowDrag = isElectronUserAgent(navigator.userAgent)

  const [s, set] = createStore({
    workspaces: [] as WorkspaceSummary[],
    name: "",
    key: crypto.randomUUID(),
    terminal: null as { run: string; task: string } | null,
  })

  const host = createModuleHost(client, props.navigation.openPage)

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
      set({ terminal: null })

      if (scope) void client.perform(refresh)
    }),
  )
  onCleanup(host.close)

  const open = (workspace: string, conversation: string) => {
    void props.navigation.open(workspace, conversation)
  }

  const desk = () =>
    void client.perform(async () => {
      const result = await client.command<{ conversation: { public_id: string } }>({
        action: "application.operation",
        operation: { action: "personal_desk" },
      })
      open(client.workspace(), result.conversation.public_id)
    })

  return (
    <ModuleContext.Provider
      value={{
        host,
        terminal: (target) => {
          props.navigation.openPage("Terminals")
          set({ terminal: target })
        },
      }}
    >
      <nav
        class="nexus-management-bar"
        aria-label="Nexus administration"
        data-tauri-drag-region={windowDrag && !props.navigation.page() ? "" : undefined}
      >
        <Show when={props.chat.s.connection}>
          <select
            aria-label="Workspace"
            value={client.workspace()}
            disabled={props.chat.s.connecting || props.chat.s.sending}
            onChange={(event) => {
              void props.navigation.open(event.currentTarget.value)
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
              "Inbox",
              "Routines",
              "Knowledge",
              "Workspaces",
              "Bots",
              "Presets",
              "Schedules",
              "Plugins",
              "Integrations",
              "Channels",
              "Terminals",
              ...(modelConfig.manageModels ? ["Providers"] : []),
              "Updates",
            ]}
          >
            {(label) => (
              <Button size="small" onClick={() => props.navigation.openPage(label)}>
                {label}
              </Button>
            )}
          </For>
          <Button size="small" onClick={desk}>
            Personal Desk
          </Button>
          <For each={host.entries("sidebar.panellist")}>
            {(entry) => (
              <Button size="small" onClick={() => props.navigation.openPage(entry.id)}>
                {entry.label}
              </Button>
            )}
          </For>
          <SlotView
            host={host}
            slot="conversation.header.utilities"
            values={{
              conversation: props.chat.s.id,
              workspace: client.workspace(),
              item: props.navigation.item(),
              open,
            }}
          />
        </Show>
        <Button size="small" onClick={() => props.navigation.openPage("Settings")}>
          Settings & account
        </Button>
      </nav>
      <Show when={props.navigation.page()}>
        <div
          class="nexus-management"
          classList={{ "nexus-plugins-page": props.navigation.page() === "Plugins" }}
          role="dialog"
          aria-modal="true"
          aria-label={props.navigation.page()}
          onKeyDown={(event) => {
            if (event.key === "Escape") props.navigation.openPage("")
          }}
        >
          <header data-tauri-drag-region={windowDrag ? "" : undefined}>
            <h2>{props.navigation.page()}</h2>
            <Button class="ml-auto" onClick={() => props.navigation.openPage("")}>
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
            <Show when={client.scope() ?? "unpaired"} keyed>
              {(_scope) => (
                <Switch
                  fallback={
                    <SlotView
                      host={host}
                      slot="main"
                      id={props.navigation.page()}
                      values={{
                        conversation: props.chat.s.id,
                        workspace: client.workspace(),
                        item: props.navigation.item(),
                        open,
                      }}
                    />
                  }
                >
                  <Match when={props.navigation.page() === "Settings"}>
                    <Settings client={client} host={host} />
                  </Match>
                  <Match when={props.navigation.page() === "Bots"}>
                    <Bots
                      client={client}
                      host={host}
                      open={open}
                      selected={props.navigation.item()}
                      select={(id) => props.navigation.openPage("Bots", id)}
                    />
                  </Match>
                  <Match when={props.navigation.page() === "Presets"}>
                    <Presets client={client} />
                  </Match>
                  <Match when={props.navigation.page() === "Schedules"}>
                    <Schedules
                      client={client}
                      open={open}
                      selected={props.navigation.item()}
                      select={(id) => props.navigation.openPage("Schedules", id)}
                    />
                  </Match>
                  <Match when={props.navigation.page() === "Plugins"}>
                    <Plugins
                      client={client}
                      host={host}
                      select={props.navigation.item()}
                      navigate={(id) => props.navigation.openPage("Plugins", id)}
                    />
                  </Match>
                  <Match when={props.navigation.page() === "Integrations"}>
                    <Integrations client={client} />
                  </Match>
                  <Match when={props.navigation.page() === "Inbox"}>
                    <Inbox client={client} open={open} />
                  </Match>
                  <Match when={props.navigation.page() === "Routines"}>
                    <Routines client={client} />
                  </Match>
                  <Match when={props.navigation.page() === "Channels"}>
                    <Channels client={client} />
                  </Match>
                  <Match when={props.navigation.page() === "Knowledge"}>
                    <Knowledge
                      client={client}
                      selected={props.navigation.item()}
                      select={(id) => props.navigation.openPage("Knowledge", id)}
                    />
                  </Match>
                  <Match when={props.navigation.page() === "Providers"}>
                    <Providers client={client} />
                  </Match>
                  <Match when={props.navigation.page() === "Terminals"}>
                    <Terminals client={client} target={s.terminal ?? undefined} />
                  </Match>
                  <Match when={props.navigation.page() === "Updates"}>
                    <Updates client={client} />
                  </Match>
                  <Match when={props.navigation.page() === "Workspaces"}>
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
                                  void props.navigation.open(row.public_id)
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
                            const result = await client.command<{ workspace: WorkspaceSummary }>({
                              action: "workspace.create",
                              name: s.name,
                              key: s.key,
                            })

                            set({ name: "", key: crypto.randomUUID() })
                            await props.navigation.open(result.workspace.public_id)
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
              )}
            </Show>
          </div>
        </div>
      </Show>
      {props.children}
      <div class="nexus-module-dock">
        <SlotView
          host={host}
          slot="dock.tab"
          values={{ conversation: props.chat.s.id, workspace: client.workspace(), item: props.navigation.item(), open }}
        />
      </div>
    </ModuleContext.Provider>
  )
}
