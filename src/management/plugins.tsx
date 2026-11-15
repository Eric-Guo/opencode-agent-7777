import { For, Show, onMount, createEffect, on } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Schema } from "effect"
import type { Nexus } from "@opencode/schema/nexus"
import type { ManagementClient } from "./client"
import type { ModuleHost } from "./modules"
import { SlotView } from "./slot"
import { ConfigurationForm, FieldRow, JsonInput } from "./fields"

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

  const configure = async (row: Nexus.Extension, operations: Nexus.FieldOperation[]) =>
    c.perform(async () => {
      const result = await c.command<Nexus.ConfigurationResult>({
        action: "extension.configure",
        change: { id: row.id, operations },
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

  onMount(() => void c.perform(refresh))

  return (
    <section>
      <h2>Plugins</h2>
      <Button onClick={() => void c.perform(refresh)}>Refresh</Button>
      <div class="nexus-columns">
        <For each={s.rows}>
          {(row) => (
            <div class="nexus-card">
              <h3>
                <button onClick={() => select(row.id)}>{row.name}</button>
              </h3>
              <p>{row.description}</p>
              <small>
                {row.restart_required
                  ? "Restart required"
                  : row.enabled && !row.ready
                    ? row.diagnostics.length
                      ? "Failed"
                      : "Setup needed"
                    : ""}
              </small>
              <FieldRow label="Enabled">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  disabled={c.state.busy}
                  onChange={(event) => {
                    const enabled = event.currentTarget.checked
                    void c.perform(async () => {
                      await c.command({ action: "extension.configure", change: { id: row.id, enabled } })
                      await refresh()
                    })
                  }}
                />
              </FieldRow>
              <Show when={s.rows.some((item) => item.enabled && item.requires?.includes(row.id))}>
                <small>
                  Required by{" "}
                  {s.rows
                    .filter((item) => item.enabled && item.requires?.includes(row.id))
                    .map((item) => item.name)
                    .join(", ")}
                  . Disable those plugins first.
                </small>
              </Show>
              <Button onClick={() => select(row.id)}>Settings</Button>
            </div>
          )}
        </For>
      </div>
      <Show when={s.rows.find((row) => row.id === s.selected)}>
        {(selected) => (
          <div class="nexus-card">
            <h3>{selected().name}</h3>
            <p>
              {selected().active ? "Running" : "Not running"} · Configuration version {selected().configuration_version}
            </p>
            <For each={selected().diagnostics}>{(text) => <p class="nexus-error">{text}</p>}</For>
            <Show when={props.host.errors()[selected().id]}>
              <p class="nexus-error">{props.host.errors()[selected().id]}</p>
            </Show>
            <p>Tools: {selected().tools.join(", ") || "None"}</p>
            <p>Commands: {selected().commands?.join(", ") || "None"}</p>
            <Show when={selected().source}>
              <details>
                <summary>Installed source</summary>
                <pre>{JSON.stringify(selected().source, null, 2)}</pre>
              </details>
            </Show>
            <ConfigurationForm
              schema={selected().configuration_schema}
              values={selected().configuration}
              busy={c.state.busy}
              models={c.chat.s.choices?.models}
              save={(operations) => configure(selected(), operations)}
            />
            <SlotView
              host={props.host}
              slot="plugins.item.config"
              id={selected().id}
              values={{ plugin: selected(), refresh }}
            />
          </div>
        )}
      </Show>
      <div class="nexus-card">
        <h3>Managed packages</h3>
        <form
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
          <FieldRow label="Source directory on the service machine">
            <input required value={s.path} onInput={(e) => set("path", e.currentTarget.value)} />
          </FieldRow>
          <Button disabled={c.state.busy} type="submit">
            Install candidate
          </Button>
        </form>
        <FieldRow label="Installed version">
          <select
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
        </FieldRow>
        <JsonInput
          label="Activation configuration"
          valid={(value) => set("valid", value)}
          value={s.configuration}
          change={(value) =>
            set("configuration", Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(value))
          }
        />
        <div class="nexus-actions">
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
    </section>
  )
}
