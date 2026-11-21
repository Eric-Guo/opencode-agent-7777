import { For, Show, onMount } from "solid-js"
import { createStore, reconcile, unwrap } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { NexusPreset } from "@opencode/schema/nexus-preset"
import type { ManagementClient } from "./client"
import { PresetTools } from "./preset-tools"
import { FieldRow, JsonInput } from "./fields"
import { Schema } from "effect"

export function Presets(props: { client: ManagementClient }) {
  const c = props.client

  const [s, set] = createStore({
    catalog: null as NexusPreset.Catalog | null,
    choices: null as NexusPreset.ToolChoices | null,
    discoveryError: "",
    id: "",
    name: "",
    description: "",
    config: {} as NexusPreset.Configuration,
    role: "",
    roleDescription: "",
    importText: "",
    format: "md" as "md" | "json",
    exported: "",
  })

  const refresh = async () => {
    await Promise.all([
      c.command<NexusPreset.Catalog>({ action: "preset.list" }).then((catalog) => set("catalog", catalog)),
      c.command<NexusPreset.ToolChoices>({ action: "preset.tools" }).then(
        (choices) => set({ choices, discoveryError: "" }),
        (error: Error) => set("discoveryError", error.message),
      ),
    ])
  }
  onMount(() => void c.perform(refresh))

  const edit = (entry: NexusPreset.Entry) => {
    set("config", reconcile(structuredClone(unwrap(entry.configuration))))
    set({
      id: entry.public_id,
      name: entry.name,
      description: entry.description,
      role: entry.role?.name ?? "",
      roleDescription: entry.role?.description ?? "",
    })
  }

  const update = (patch: Partial<NexusPreset.Configuration>) => set("config", reconcile({ ...s.config, ...patch }))

  const list = (value: string) =>
    value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)

  return (
    <section>
      <h2>Agent Presets and roles</h2>
      <div class="nexus-actions">
        <Button onClick={() => void c.perform(refresh)}>Refresh</Button>
        <Button
          onClick={() => {
            set({ id: "", name: "", description: "" })
            set("config", reconcile({}))
          }}
        >
          New Preset
        </Button>
      </div>
      <For each={s.catalog?.presets}>
        {(entry) => (
          <div class="nexus-card">
            <h3>{entry.name}</h3>
            <p>{entry.description}</p>
            <small>
              {entry.role ? "Role: " + entry.role.name : ""}
              {s.catalog?.main_preset_public_id === entry.public_id ? " · Main Agent" : ""}
              {s.catalog?.default_bot_preset_public_id === entry.public_id ? " · New Bots" : ""}
            </small>
            <div class="nexus-actions">
              <Button onClick={() => edit(entry)}>Edit</Button>
              <For each={["select-main", "select-default-bot", "duplicate", "remove", "unpublish"] as const}>
                {(action) => (
                  <Button
                    disabled={c.state.busy}
                    onClick={() =>
                      void c.perform(async () => {
                        await c.command(
                          action === "duplicate"
                            ? { action: "preset.duplicate", id: entry.public_id, name: entry.name + " copy" }
                            : { action: `preset.${action}`, id: entry.public_id },
                        )
                        await refresh()
                      })
                    }
                  >
                    {
                      {
                        "select-main": "Use for Main",
                        "select-default-bot": "Default for new Bots",
                        duplicate: "Duplicate",
                        remove: "Remove",
                        unpublish: "Unpublish role",
                      }[action]
                    }
                  </Button>
                )}
              </For>
              <For each={["md", "json"] as const}>
                {(format) => (
                  <Button
                    onClick={() =>
                      void c.perform(async () => {
                        const result = await c.command<{ content: string } | string>({
                          action: "preset.export-document",
                          id: entry.public_id,
                          format,
                        })

                        set("exported", typeof result === "string" ? result : result.content)
                      })
                    }
                  >
                    Export {format.toUpperCase()}
                  </Button>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
      <form
        class="nexus-card"
        onSubmit={(event) => {
          event.preventDefault()
          void c.perform(async () => {
            const value = { name: s.name, description: s.description, configuration: s.config }

            const entry = await c.command<NexusPreset.Entry>(
              s.id ? { action: "preset.replace", id: s.id, value } : { action: "preset.create", value },
            )

            edit(entry)
            await refresh()
          })
        }}
      >
        <h3>{s.id ? "Edit Preset" : "New Preset"}</h3>
        <fieldset disabled={c.state.busy}>
          <FieldRow label="Name">
            <input required value={s.name} onInput={(e) => set("name", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="Description">
            <input required value={s.description} onInput={(e) => set("description", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="System instructions">
            <textarea
              rows={8}
              value={s.config.system_prompt ?? ""}
              onInput={(e) => update({ system_prompt: e.currentTarget.value })}
            />
          </FieldRow>
          <FieldRow label="Model choice">
            <select
              value={s.config.model_mode ?? "default"}
              onChange={(e) => update({ model_mode: e.currentTarget.value as "default" | "follow" })}
            >
              <option value="default">Preset or installation default</option>
              <option value="follow">Follow current model</option>
            </select>
          </FieldRow>
          <FieldRow label="Default model">
            <select value={s.config.model ?? ""} onChange={(e) => update({ model: e.currentTarget.value || null })}>
              <option value="">Inherit</option>
              <For each={c.chat.s.choices?.models}>{(model) => <option>{model}</option>}</For>
            </select>
          </FieldRow>
          <FieldRow label="Fallback policy">
            <select
              value={s.config.fallback_models == null ? "inherit" : s.config.fallback_models.length ? "custom" : "none"}
              onChange={(e) =>
                update({
                  fallback_models:
                    e.currentTarget.value === "inherit"
                      ? null
                      : e.currentTarget.value === "none"
                        ? []
                        : [c.chat.s.connection?.model ?? ""],
                })
              }
            >
              <option value="inherit">Inherit global list</option>
              <option value="none">No fallback</option>
              <option value="custom">Custom ordered list</option>
            </select>
          </FieldRow>
          <Show when={s.config.fallback_models?.length}>
            <FieldRow label="Fallback models, in order">
              <textarea
                value={s.config.fallback_models?.join("\n")}
                onInput={(e) => update({ fallback_models: list(e.currentTarget.value) })}
              />
            </FieldRow>
          </Show>
          <Show when={s.discoveryError}>
            <p role="alert">{s.discoveryError}. Your selections are kept.</p>
          </Show>
          <PresetTools configuration={s.config} choices={s.choices} update={update} />
          <JsonInput
            label="Advanced configuration, including MCP selections"
            value={s.config}
            change={(value) => set("config", reconcile(Schema.decodeUnknownSync(NexusPreset.Configuration)(value)))}
          />
          <Button type="submit">Save Preset</Button>
        </fieldset>
      </form>
      <Show when={s.id}>
        <form
          class="nexus-card"
          onSubmit={(event) => {
            event.preventDefault()
            void c.perform(async () => {
              await c.command({
                action: "preset.publish",
                id: s.id,
                role: { name: s.role, description: s.roleDescription },
              })
              await refresh()
            })
          }}
        >
          <h3>Publish subagent role</h3>
          <FieldRow label="Role name">
            <input required value={s.role} onInput={(e) => set("role", e.currentTarget.value)} />
          </FieldRow>
          <FieldRow label="When to choose this role">
            <textarea
              required
              value={s.roleDescription}
              onInput={(e) => set("roleDescription", e.currentTarget.value)}
            />
          </FieldRow>
          <Button type="submit" disabled={c.state.busy}>
            Publish role
          </Button>
        </form>
      </Show>
      <form
        class="nexus-card"
        onSubmit={(event) => {
          event.preventDefault()
          void c.perform(async () => {
            await c.command({ action: "preset.import-document", content: s.importText, format: s.format })
            set("importText", "")
            await refresh()
          })
        }}
      >
        <h3>Import definition</h3>
        <input
          type="file"
          accept=".md,.json"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]

            if (file)
              void file
                .text()
                .then((text) => set({ importText: text, format: file.name.endsWith(".json") ? "json" : "md" }))
          }}
        />
        <FieldRow label="Format">
          <select value={s.format} onChange={(e) => set("format", e.currentTarget.value as "md" | "json")}>
            <option value="md">Markdown</option>
            <option value="json">JSON</option>
          </select>
        </FieldRow>
        <textarea
          aria-label="Definition"
          rows={6}
          value={s.importText}
          onInput={(e) => set("importText", e.currentTarget.value)}
        />
        <Button type="submit" disabled={c.state.busy}>
          Import Preset
        </Button>
      </form>
      <Show when={s.exported}>
        <div class="nexus-card">
          <h3>Exported definition</h3>
          <textarea aria-label="Exported definition" rows={10} readOnly value={s.exported} />
          <Button onClick={() => void navigator.clipboard.writeText(s.exported)}>Copy</Button>
        </div>
      </Show>
    </section>
  )
}
