import { For, Show, createEffect, createMemo, createUniqueId, on, onMount, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Switch } from "@opencode/ui/switch"
import { Schema } from "effect"
import type { Nexus } from "@opencode/schema/nexus"
import { SettingsList } from "../settings/list"
import { SettingsRow } from "../settings/row"
import type { ManagementClient } from "./client"
import type { ModuleHost } from "./modules"
import { SlotView } from "./slot"
import { ConfigurationForm, JsonInput } from "./fields"
import "./plugins.css"

type Package = { name: string; version: string; selected?: boolean; active?: boolean }

export function Plugins(props: {
  client: ManagementClient
  host: ModuleHost
  select?: string
  navigate?(id: string): void
}) {
  const c = props.client

  const [s, set] = createStore({
    rows: [] as Nexus.Extension[],
    packages: [] as Package[],
    path: "",
    selected: props.select ?? "",
    package: "",
    version: "",
    configuration: {} as Record<string, Schema.Json>,
    output: "",
    valid: true,
  })

  createEffect(
    on(
      () => props.select,
      (id) => set("selected", id ?? ""),
    ),
  )

  const select = (id: string) => {
    set("selected", id)
    props.navigate?.(id)
  }

  const refresh = async () => {
    const scope = c.scope()
    const rows = await c.command<Nexus.Extension[]>({ action: "extension.list" })

    if (scope !== c.scope()) return
    set("rows", rows)
    await props.host.sync(rows)
    set("packages", (await c.extension<{ packages: Package[] }>("packages", { action: "package.list" })).packages)
  }

  const configure = async (id: string, operations: Nexus.FieldOperation[]) =>
    c.perform(async () => {
      const result = await c.command<Nexus.ConfigurationResult>({
        action: "extension.configure",
        change: { id, operations },
      })

      c.notice(
        result.restart_required
          ? "Saved. Restart the service to apply this change."
          : result.applied
            ? "Saved and applied."
            : "Saved. Activation is in progress; refresh to read its status.",
      )
      await refresh()
    })

  // Keep editors mounted by plugin ID while the inventory is refreshed.
  const plugins = createMemo(() => new Map(s.rows.map((row) => [row.id, row])))

  function pluginRow(row: Accessor<Nexus.Extension>) {
    const id = row().id
    const details = createUniqueId()
    const expanded = () => s.selected === id
    const dependents = createMemo(() =>
      s.rows
        .filter((item) => item.enabled && item.requires?.includes(id))
        .map((item) => item.name)
        .join(", "),
    )
    const status = () => {
      if (row().restart_required) return "Restart required"
      if (row().enabled && !row().ready) return row().diagnostics.length ? "Failed" : "Setup needed"
    }

    let trigger!: HTMLButtonElement

    createEffect(() => {
      if (expanded()) trigger.scrollIntoView({ block: "nearest" })
    })

    return (
      <div class="nexus-plugin">
        <SettingsRow
          title={
            <Button
              ref={trigger}
              class="nexus-plugin-toggle"
              size="small"
              variant="ghost"
              flush="start"
              aria-expanded={expanded()}
              aria-controls={expanded() ? details : undefined}
              onClick={() => select(expanded() ? "" : id)}
            >
              {row().name}
              <Icon name={expanded() ? "chevron-down" : "chevron-right"} size="small" />
            </Button>
          }
          description={
            <>
              <Show when={row().description}>
                <p>{row().description}</p>
              </Show>
              <Show when={status()}>
                {(text) => (
                  <p class="nexus-plugin-warning" classList={{ "is-error": text() === "Failed" }}>
                    {text()}
                  </p>
                )}
              </Show>
              <Show when={dependents()}>{(names) => <p>Required by {names()}. Disable those plugins first.</p>}</Show>
            </>
          }
        >
          <Switch
            hideLabel
            checked={row().enabled}
            disabled={c.state.busy}
            onChange={(enabled) =>
              void c.perform(async () => {
                await c.command({ action: "extension.configure", change: { id, enabled } })
                await refresh()
              })
            }
          >
            Enable {row().name}
          </Switch>
        </SettingsRow>
        <Show when={expanded()}>
          <div id={details} class="nexus-plugin-details">
            <For each={row().diagnostics}>{(message) => <p class="nexus-error">{message}</p>}</For>
            <Show when={props.host.errors()[id]}>
              <p class="nexus-error">{props.host.errors()[id]}</p>
            </Show>
            <ConfigurationForm
              schema={row().configuration_schema}
              values={row().configuration}
              busy={c.state.busy}
              models={c.chat.s.choices?.models}
              save={(operations) => configure(id, operations)}
            />
            <SlotView host={props.host} slot="plugins.item.config" id={id} values={{ plugin: row(), refresh }} />
            <details class="nexus-plugin-metadata">
              <summary>Plugin details</summary>
              <p>
                {row().active ? "Running" : "Not running"} · Configuration version {row().configuration_version}
              </p>
              <p>Tools: {row().tools.join(", ") || "None"}</p>
              <p>Commands: {row().commands?.join(", ") || "None"}</p>
              <Show when={row().source}>
                <p>Installed source</p>
                <pre>{JSON.stringify(row().source, null, 2)}</pre>
              </Show>
            </details>
          </div>
        </Show>
      </div>
    )
  }

  onMount(() => void c.perform(refresh))

  return (
    <section class="nexus-plugin-settings">
      <section aria-labelledby="nexus-installed-plugins">
        <header class="nexus-plugin-section-header">
          <h3 id="nexus-installed-plugins">Installed plugins</h3>
          <Button size="small" disabled={c.state.busy} onClick={() => void c.perform(refresh)}>
            Refresh
          </Button>
        </header>
        <SettingsList>
          <For
            each={[...plugins().keys()]}
            fallback={
              <Show when={!c.state.error}>
                <p class="nexus-plugin-empty">{c.state.busy ? "Loading plugins…" : "No plugins installed."}</p>
              </Show>
            }
          >
            {(id) => <Show when={plugins().get(id)}>{pluginRow}</Show>}
          </For>
        </SettingsList>
      </section>
      <section aria-labelledby="nexus-managed-packages">
        <header class="nexus-plugin-section-header">
          <h3 id="nexus-managed-packages">Managed packages</h3>
        </header>
        <SettingsList>
          <form
            class="nexus-package-row"
            onSubmit={(event) => {
              event.preventDefault()
              void c.perform(async () => {
                set(
                  "output",
                  JSON.stringify(await c.extension("packages", { action: "package.install", path: s.path }), null, 2),
                )
                await refresh()
              })
            }}
          >
            <SettingsRow
              title={<label for="nexus-package-path">Source directory</label>}
              description="Path on the service machine."
            >
              <div class="nexus-package-install">
                <input
                  id="nexus-package-path"
                  required
                  value={s.path}
                  onInput={(event) => set("path", event.currentTarget.value)}
                />
                <Button disabled={c.state.busy} type="submit">
                  Install candidate
                </Button>
              </div>
            </SettingsRow>
          </form>
          <div class="nexus-package-row">
            <SettingsRow title={<label for="nexus-package-version">Installed version</label>}>
              <select
                id="nexus-package-version"
                value={s.package + "/" + s.version}
                onChange={(e) => {
                  const [name, version] = e.currentTarget.value.split("/")
                  set({ package: name, version })
                }}
              >
                <option value="/">Choose a package version</option>
                <For each={s.packages}>
                  {(row) => (
                    <option value={row.name + "/" + row.version}>
                      {row.name} · {row.version.slice(0, 12)}
                      {row.selected ? " · selected" : ""}
                    </option>
                  )}
                </For>
              </select>
            </SettingsRow>
          </div>
          <div class="nexus-package-activation">
            <JsonInput
              label="Activation configuration"
              valid={(value) => set("valid", value)}
              value={s.configuration}
              change={(value) =>
                set("configuration", Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(value))
              }
            />
            <div class="nexus-actions nexus-package-actions">
              <For each={["check", "activate", "rollback", "disable"] as const}>
                {(action) => (
                  <Button
                    disabled={c.state.busy || !s.package || !s.valid}
                    onClick={() =>
                      void c.perform(async () => {
                        set(
                          "output",
                          JSON.stringify(
                            await c.extension("packages", {
                              action: `package.${action}`,
                              name: s.package,
                              version: s.version,
                              ...(action === "activate" ? { configuration: s.configuration } : {}),
                            }),
                            null,
                            2,
                          ),
                        )
                        await refresh()
                      })
                    }
                  >
                    {
                      {
                        check: "Check version",
                        activate: "Activate version",
                        rollback: "Roll back",
                        disable: "Disable package",
                      }[action]
                    }
                  </Button>
                )}
              </For>
            </div>
            <Show when={s.output}>
              <pre>{s.output}</pre>
            </Show>
          </div>
        </SettingsList>
      </section>
    </section>
  )
}
