import { For, Show, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Schema } from "effect"
import type {
  ModelProvider,
  PlatformModelProviderConfiguration,
  PlatformAuthorizationSession,
  PlatformDiscoveredModel,
} from "@cybros/agent"
import type { ManagementClient } from "./client"
import { FieldRow, JsonInput } from "./fields"

const root = "/api/v1/admin/model_providers"

export function Providers(props: { client: ManagementClient }) {
  const c = props.client

  const [s, set] = createStore({
    rows: [] as ModelProvider[],
    selected: "",
    configuration: null as PlatformModelProviderConfiguration | null,
    definition: {} as Schema.Json,
    modelDefinition: {} as Schema.Json,
    model: "",
    key: "",
    authorization: null as PlatformAuthorizationSession | null,
    discovered: [] as PlatformDiscoveredModel[],
    output: "",
  })

  const refresh = async () =>
    set("rows", (await c.platform<{ model_providers: ModelProvider[] }>(root)).model_providers)

  const path = () => root + "/" + encodeURIComponent(s.selected)

  const select = async (id: string) => {
    const configuration = await c.platform<PlatformModelProviderConfiguration>(root + "/" + encodeURIComponent(id))
    set({
      selected: id,
      configuration,
      definition: configuration.definition ?? {},
      model: "",
      modelDefinition: {},
      key: "",
      authorization: null,
      discovered: [],
      output: "",
    })
  }

  const mutate = async (
    suffix: string,
    method: "POST" | "PUT" | "DELETE",
    values: Record<string, Schema.Json> = {},
  ) => {
    const result = await c.platform(path() + suffix, method, {
      command: { expected_lock_version: s.configuration!.provider.lock_version, ...values },
    })

    set("output", JSON.stringify(result, null, 2))
    set("configuration", await c.platform<PlatformModelProviderConfiguration>(path()))
    await refresh()
  }

  onMount(() => void c.perform(refresh))

  return (
    <section>
      <h2>Nexus model providers</h2>
      <p>Provider administration requires a Nexus Human account with administrator access.</p>
      <Button onClick={() => void c.perform(refresh)}>Refresh providers</Button>
      <div class="nexus-columns">
        <For each={s.rows}>
          {(row) => (
            <div class="nexus-card">
              <h3>{row.display_name || row.id}</h3>
              <p>
                {row.enabled ? "Enabled" : "Disabled"} · {row.configured ? "Configured" : "Setup required"} ·{" "}
                {row.models} models
              </p>
              <p>{row.reauthorization_required ? "Reauthorization required" : row.credentials}</p>
              <Button onClick={() => void c.perform(() => select(row.id))}>Configure provider</Button>
            </div>
          )}
        </For>
      </div>
      <Show when={s.configuration}>
        {(configuration) => (
          <div class="nexus-card">
            <h3>{configuration().provider.display_name || s.selected}</h3>
            <Button
              disabled={c.state.busy}
              onClick={() =>
                void c.perform(() => mutate("/lane", "PUT", { enabled: !configuration().provider.enabled }))
              }
            >
              {configuration().provider.enabled ? "Disable provider" : "Enable provider"}
            </Button>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void c.perform(async () => {
                  await c.platform(path() + "/api_key", "PUT", { command: { api_key: s.key } })
                  set("key", "")
                  await refresh()
                  set("configuration", await c.platform(path()))
                })
              }}
            >
              <FieldRow label="API key">
                <input
                  required
                  type="password"
                  autocomplete="new-password"
                  value={s.key}
                  onInput={(e) => set("key", e.currentTarget.value)}
                />
              </FieldRow>
              <div class="nexus-actions">
                <Button type="submit" disabled={c.state.busy}>
                  Save API key
                </Button>
                <Button
                  disabled={c.state.busy}
                  onClick={() =>
                    void c.perform(async () => {
                      await c.platform(path() + "/api_key", "DELETE")
                      await refresh()
                      set("configuration", await c.platform(path()))
                    })
                  }
                >
                  Remove API key
                </Button>
              </div>
            </form>
            <div class="nexus-actions">
              <Button
                disabled={c.state.busy}
                onClick={() =>
                  void c.perform(async () =>
                    set(
                      "authorization",
                      (
                        await c.platform<{ authorization_session: PlatformAuthorizationSession }>(
                          path() + "/authorization",
                          "POST",
                          { command: { restart: false } },
                        )
                      ).authorization_session,
                    ),
                  )
                }
              >
                Start provider authorization
              </Button>
              <Button
                disabled={c.state.busy}
                onClick={() =>
                  void c.perform(async () => {
                    await c.platform(path() + "/authorization", "DELETE")
                    set("authorization", null)
                    await refresh()
                  })
                }
              >
                Clear authorization
              </Button>
            </div>
            <Show when={s.authorization}>
              {(authorization) => (
                <div>
                  <p>
                    {authorization().progress} · {authorization().state}
                  </p>
                  <Show when={authorization().verification_uri}>
                    <a target="_blank" rel="noreferrer" href={authorization().verification_uri!}>
                      Authorize provider
                    </a>{" "}
                    <strong>{authorization().user_code}</strong>
                  </Show>
                  <Button
                    onClick={() =>
                      void c.perform(async () => {
                        set(
                          "authorization",
                          (
                            await c.platform<{ authorization_session: PlatformAuthorizationSession }>(
                              path() + "/authorization/sessions/" + encodeURIComponent(authorization().public_id),
                            )
                          ).authorization_session,
                        )
                        await refresh()
                      })
                    }
                  >
                    Check authorization
                  </Button>
                </div>
              )}
            </Show>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void c.perform(() => mutate("/definition", "PUT", { definition: s.definition }))
              }}
            >
              <JsonInput
                label="Provider definition"
                value={s.definition}
                change={(value) => set("definition", value)}
              />
              <div class="nexus-actions">
                <Button type="submit" disabled={c.state.busy}>
                  Save definition
                </Button>
                <Button
                  disabled={c.state.busy}
                  onClick={() =>
                    void c.perform(async () => {
                      await mutate("/definition", "DELETE")
                      set("definition", s.configuration?.definition ?? {})
                    })
                  }
                >
                  Restore built-in definition
                </Button>
              </div>
            </form>
            <h3>Models</h3>
            <Button
              disabled={c.state.busy}
              onClick={() =>
                void c.perform(async () =>
                  set(
                    "discovered",
                    (
                      await c.platform<{ models: PlatformDiscoveredModel[] }>(path() + "/model_discovery", "POST", {
                        command: { expected_lock_version: configuration().provider.lock_version },
                      })
                    ).models,
                  ),
                )
              }
            >
              Discover models
            </Button>
            <For each={s.discovered}>
              {(row) => (
                <div class="nexus-actions">
                  <span>{row.display_name || row.id}</span>
                  <Button onClick={() => set({ model: row.id, modelDefinition: {} })}>Add definition</Button>
                </div>
              )}
            </For>
            <For each={configuration().models}>
              {(row) => (
                <div class="nexus-actions">
                  <span>
                    {row.model} · {row.source}
                    {row.removed ? " · removed" : ""}
                  </span>
                  <Button onClick={() => set({ model: row.model, modelDefinition: row.definition ?? {} })}>Edit</Button>
                </div>
              )}
            </For>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void c.perform(() =>
                  mutate("/model_definition", "PUT", { model: s.model, definition: s.modelDefinition }),
                )
              }}
            >
              <FieldRow label="Model ID">
                <input required value={s.model} onInput={(e) => set("model", e.currentTarget.value)} />
              </FieldRow>
              <JsonInput
                label="Model definition"
                value={s.modelDefinition}
                change={(value) => set("modelDefinition", value)}
              />
              <Button type="submit" disabled={c.state.busy}>
                Save model definition
              </Button>
            </form>
            <Show when={s.model}>
              <div class="nexus-actions">
                <For
                  each={
                    [
                      ["Show", "/model_visibility", { visible: true }],
                      ["Hide", "/model_visibility", { visible: false }],
                      ["Available", "/model_availability", { available: true }],
                      ["Unavailable", "/model_availability", { available: false }],
                    ] as const
                  }
                >
                  {([label, suffix, value]) => (
                    <Button
                      disabled={c.state.busy}
                      onClick={() => void c.perform(() => mutate(suffix, "PUT", { model: s.model, ...value }))}
                    >
                      {label}
                    </Button>
                  )}
                </For>
                <Button
                  disabled={c.state.busy}
                  onClick={() => void c.perform(() => mutate("/model_definition/reset", "POST", { model: s.model }))}
                >
                  Reset model
                </Button>
                <Button
                  disabled={c.state.busy}
                  onClick={() => void c.perform(() => mutate("/model_definition", "DELETE", { model: s.model }))}
                >
                  Remove model
                </Button>
              </div>
              <details>
                <summary>Test selected model</summary>
                <p>
                  This sends one real request to {s.selected}/{s.model}. Provider charges may apply.
                </p>
                <Button
                  disabled={c.state.busy}
                  onClick={() => void c.perform(() => mutate("/model_test", "POST", { model: s.model }))}
                >
                  Send test request
                </Button>
              </details>
            </Show>
            <Show when={s.output}>
              <pre>{s.output}</pre>
            </Show>
          </div>
        )}
      </Show>
    </section>
  )
}
