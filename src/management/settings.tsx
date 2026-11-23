import { For, Show, createMemo, createResource, createSignal, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Checkbox } from "@opencode/ui/checkbox"
import { Button } from "@opencode/ui/button"
import type { NexusSettings } from "@opencode/schema/nexus-settings"
import type { ManagementClient } from "./client"
import type { ModuleHost } from "./modules"
import { SlotView } from "./slot"
import { FieldRow } from "./fields"
import { request } from "../nexus/controller"

type KernelTool = { canonical: string; name: string; description: string }

const groupOrder = ["graph", "human", "conversation", "memory", "skill", "tools", "runners"]

type Setup = {
  status: { state: string; origin: string | null; error: string | null; pairing?: { url: string; code: string } }
  account: { id: string; role: string } | null
}

export function Settings(props: { client: ManagementClient; host: ModuleHost }) {
  const c = props.client

  const [s, set] = createStore({
    setup: null as Setup | null,
    persona: "",
    model: "",
    workspace: "",
    directory: "",
    url: "",
    code: "",
    review: "",
    path: "",
    reviewModel: "",
  })

  const [saved, setSaved] = createSignal<NexusSettings.Values>()
  const scope = c.scope()
  const draft = () => {
    const entry = c.defaultsDraft()
    return entry && entry.scope === scope ? entry.patch : {}
  }
  const values = createMemo(() => {
    const current = saved()
    return current && { ...current, ...draft() }
  })
  const models = () => c.chat.s.choices?.models ?? []
  const [catalog] = createResource(
    () => scope,
    (activeScope) => request<KernelTool[]>("/settings/kernel-tools", activeScope).catch(() => undefined),
  )
  const toolGroups = createMemo(() => {
    const names = [
      ...new Set([
        ...(catalog() ?? []).map((tool) => tool.canonical),
        ...(saved()?.kernel_tools ?? []),
        ...(draft().kernel_tools ?? []),
      ]),
    ]
    return Map.groupBy(names, (name) => name.split(".")[1] || name)
  })
  const groups = () => [...new Set([...groupOrder, ...toolGroups().keys()])].filter((name) => toolGroups().has(name))

  const edit = (change: NexusSettings.Patch) => {
    if (!scope) return
    const patch = Object.fromEntries(
      Object.entries({ ...draft(), ...change }).filter(
        ([key, value]) => JSON.stringify(value) !== JSON.stringify(saved()?.[key as keyof NexusSettings.Values]),
      ),
    )
    c.setDefaultsDraft({ scope, patch })
  }

  const refresh = async () => {
    set("setup", await request<Setup>("/setup"))

    if (!c.scope()) return
    setSaved(await c.command<NexusSettings.Values>({ action: "settings.read" }))
    edit({})
    set(
      "persona",
      editablePersona()
        ? ((await c.command<{ content: string | null }>({ action: "persona.read" })).content ?? "")
        : "",
    )
  }

  const saveDefaults = async () => {
    const patch = { ...draft() }
    if (!Object.keys(patch).length) return
    if (patch.kernel_tools)
      patch.kernel_tools = orderedTools(saved()?.kernel_tools ?? [], catalog(), new Set(patch.kernel_tools))
    setSaved(await c.command<NexusSettings.Values>({ action: "settings.update", patch }))
    c.setDefaultsDraft(undefined)
    c.notice("Defaults saved for new conversations.")
  }

  const editablePersona = () => !!s.setup?.account && s.setup.account.id === c.human()

  const account = async (action: "login" | "device" | "logout" | "disconnect") => {
    const result = await request<{ url?: string; code?: string } | string | null>("/setup", undefined, { action })
    set({
      url: typeof result === "string" ? result : (result?.url ?? ""),
      code: typeof result === "object" ? (result?.code ?? "") : "",
    })
    await refresh()
  }

  onMount(() => void c.perform(refresh))

  return (
    <section>
      <div class="nexus-card">
        <h3>Nexus account</h3>
        <p>
          {s.setup?.status.origin} · {s.setup?.status.state}
        </p>
        <Show when={s.setup?.status.error}>
          <p class="nexus-error">{s.setup?.status.error}</p>
        </Show>
        <p>
          {s.setup?.account
            ? `Signed in: ${s.setup.account.id} (${s.setup.account.role})`
            : "Sign in to manage your Nexus account and persona. The host retains your credentials."}
        </p>
        <div class="nexus-actions">
          <Show
            when={!s.setup?.account}
            fallback={
              <Button disabled={c.state.busy} onClick={() => void c.perform(() => account("logout"))}>
                Sign out
              </Button>
            }
          >
            <Button disabled={c.state.busy} onClick={() => void c.perform(() => account("login"))}>
              Sign in with browser
            </Button>
            <Button disabled={c.state.busy} onClick={() => void c.perform(() => account("device"))}>
              Sign in with device code
            </Button>
          </Show>
          <Button
            disabled={c.state.busy}
            onClick={() =>
              void c.perform(async () => {
                await c.chat.connect(c.workspace(), c.chat.s.id)
                if (!c.scope()) await refresh()
              })
            }
          >
            Refresh connection
          </Button>
        </div>
        <Show when={s.url}>
          <p>
            <a target="_blank" rel="noreferrer" href={s.url}>
              Continue Nexus sign-in
            </a>{" "}
            <strong>{s.code}</strong>
          </p>
        </Show>
        <Show when={s.setup?.status.pairing}>
          {(authorization) => (
            <p>
              <a target="_blank" rel="noreferrer" href={authorization().url}>
                Authorize this OpenCode agent
              </a>{" "}
              <strong>{authorization().code}</strong>
            </p>
          )}
        </Show>
        <Show when={s.setup?.status.state !== "ready"}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void c.perform(async () => {
                await request("/setup", undefined, {
                  action: "pair",
                  model: s.model,
                  workspace: s.workspace,
                  directory: s.directory,
                })
                await refresh()
              })
            }}
          >
            <h3>Pair this OpenCode service</h3>
            <FieldRow label="Default model (provider/model)">
              <input required value={s.model} onInput={(e) => set("model", e.currentTarget.value)} />
            </FieldRow>
            <FieldRow label="Workspace ID (optional; leave empty to create one)">
              <input value={s.workspace} onInput={(e) => set("workspace", e.currentTarget.value)} />
            </FieldRow>
            <FieldRow label="Working directory on this machine">
              <input required value={s.directory} onInput={(e) => set("directory", e.currentTarget.value)} />
            </FieldRow>
            <Button type="submit" disabled={c.state.busy}>
              Pair agent
            </Button>
          </form>
        </Show>
        <Show when={s.setup?.status.state === "ready"}>
          <details>
            <summary>Disconnect agent</summary>
            <p>Disconnecting stops this host's Nexus connection. Conversation history remains in Nexus.</p>
            <Button disabled={c.state.busy} onClick={() => void c.perform(() => account("disconnect"))}>
              Disconnect this service
            </Button>
          </details>
        </Show>
      </div>
      <Show when={values()}>
        {(current) => (
          <form
            class="nexus-card"
            onSubmit={(event) => {
              event.preventDefault()
              void c.perform(saveDefaults)
            }}
          >
            <h3>New conversation defaults</h3>
            <fieldset disabled={c.state.busy}>
              <FieldRow label="Model">
                <select
                  value={current().default_model ?? ""}
                  onChange={(e) => edit({ default_model: e.currentTarget.value || null })}
                >
                  <option value="">Installation default</option>
                  <For each={modelOptions(models(), saved()?.default_model, current().default_model)}>
                    {(model) => (
                      <option value={model} selected={current().default_model === model}>
                        {model}
                        {models().includes(model) ? "" : " (unavailable)"}
                      </option>
                    )}
                  </For>
                </select>
              </FieldRow>
              <FieldRow label="Fallback models, in order">
                <textarea
                  value={current().fallback_models.join("\n")}
                  onInput={(e) => edit({ fallback_models: lines(e.currentTarget.value) })}
                />
              </FieldRow>
              <fieldset>
                <legend>Kernel tools</legend>
                <Show when={!catalog()}>
                  <small>
                    {catalog.loading ? "Loading kernel tools…" : "Catalog unavailable. Showing saved tools."}
                  </small>
                </Show>
                <For each={groups()}>
                  {(group) => (
                    <fieldset>
                      <legend>{group}</legend>
                      <For each={toolGroups().get(group)}>
                        {(name) => {
                          const row = () => catalog()?.find((tool) => tool.canonical === name)
                          return (
                            <Checkbox
                              checked={current().kernel_tools.includes(name)}
                              description={
                                row()?.description?.split(/(?<=[.!?])\s/)[0] ||
                                row()?.name ||
                                (catalog() ? "Currently unavailable" : undefined)
                              }
                              onChange={(checked) => {
                                const selected = new Set(current().kernel_tools)
                                if (checked) selected.add(name)
                                else selected.delete(name)
                                edit({ kernel_tools: orderedTools(saved()?.kernel_tools ?? [], catalog(), selected) })
                              }}
                            >
                              {name}
                            </Checkbox>
                          )
                        }}
                      </For>
                    </fieldset>
                  )}
                </For>
              </fieldset>
              <FieldRow label="Enable subagents by default">
                <input
                  type="checkbox"
                  checked={current().subagent_default}
                  onChange={(e) => edit({ subagent_default: e.currentTarget.checked })}
                />
              </FieldRow>
              <FieldRow label="Adaptations">
                <input value={current().adaptations} onInput={(e) => edit({ adaptations: e.currentTarget.value })} />
              </FieldRow>
              <FieldRow label="Custom adaptation directory">
                <input
                  value={current().adaptations_dir ?? ""}
                  onInput={(e) => edit({ adaptations_dir: e.currentTarget.value || null })}
                />
              </FieldRow>
              <FieldRow label="Automatic title model">
                <select
                  value={current().conversation_title_model ?? ""}
                  onChange={(e) => edit({ conversation_title_model: e.currentTarget.value || null })}
                >
                  <option value="">None</option>
                  <option value="follow_current">Follow conversation model</option>
                  <For
                    each={modelOptions(
                      models(),
                      saved()?.conversation_title_model,
                      current().conversation_title_model,
                    ).filter((model) => model !== "follow_current")}
                  >
                    {(model) => (
                      <option value={model} selected={current().conversation_title_model === model}>
                        {model}
                        {models().includes(model) ? "" : " (unavailable)"}
                      </option>
                    )}
                  </For>
                </select>
              </FieldRow>
              <Button type="submit">Save defaults</Button>
            </fieldset>
          </form>
        )}
      </Show>
      <Show when={c.scope()}>
        <Show
          when={editablePersona()}
          fallback={<p>Sign in with the Human linked to this connection to edit persona.</p>}
        >
          <form
            class="nexus-card"
            onSubmit={(event) => {
              event.preventDefault()
              void c.perform(async () => {
                await c.command({ action: "persona.write", content: s.persona })
                c.notice("Persona saved.")
              })
            }}
          >
            <h3>Persona</h3>
            <textarea
              aria-label="Persona instructions"
              rows={10}
              value={s.persona}
              onInput={(e) => set("persona", e.currentTarget.value)}
            />
            <div class="nexus-actions">
              <Button type="submit" disabled={c.state.busy}>
                Save persona
              </Button>
              <Button
                disabled={c.state.busy}
                onClick={() =>
                  void c.perform(async () => {
                    await c.command({ action: "persona.reset" })
                    set(
                      "persona",
                      (await c.command<{ content: string | null }>({ action: "persona.read" })).content ?? "",
                    )
                  })
                }
              >
                Reset persona
              </Button>
            </div>
          </form>
        </Show>
        <Show when={c.chat.s.id}>
          <div class="nexus-card">
            <h3>Memory review for this conversation</h3>
            <FieldRow label="Memory file path">
              <input value={s.path} onInput={(e) => set("path", e.currentTarget.value)} />
            </FieldRow>
            <FieldRow label="Review model">
              <select value={s.reviewModel} onChange={(e) => set("reviewModel", e.currentTarget.value)}>
                <option value="">Default</option>
                <For each={c.chat.s.choices?.models}>{(model) => <option>{model}</option>}</For>
              </select>
            </FieldRow>
            <div class="nexus-actions">
              <For each={["status", "enable", "disable", "resume"]}>
                {(action) => (
                  <Button
                    disabled={c.state.busy || (action !== "status" && !c.chat.writable())}
                    onClick={() =>
                      void c.perform(async () => {
                        set(
                          "review",
                          JSON.stringify(
                            await c.extension("memory-review." + action, {
                              action: "memory-review." + action,
                              workspace: c.workspace(),
                              conversation: c.chat.s.id,
                              ...(action === "enable"
                                ? {
                                    ...(s.path ? { path: s.path } : {}),
                                    ...(s.reviewModel ? { model: s.reviewModel } : {}),
                                  }
                                : {}),
                            }),
                            null,
                            2,
                          ),
                        )
                      })
                    }
                  >
                    {action}
                  </Button>
                )}
              </For>
            </div>
            <Show when={s.review}>
              <pre>{s.review}</pre>
            </Show>
          </div>
        </Show>
      </Show>
      <SlotView host={props.host} slot="settings.section" values={{ client: c }} />
    </section>
  )
}

function modelOptions(models: string[], saved: string | null | undefined, selected: string | null) {
  return [...new Set([...models, ...(saved ? [saved] : []), ...(selected ? [selected] : [])])]
}

function orderedTools(saved: readonly string[], catalog: KernelTool[] | undefined, selected: Set<string>) {
  return [...new Set([...saved, ...(catalog ?? []).map((tool) => tool.canonical), ...selected])].filter((name) =>
    selected.has(name),
  )
}

function lines(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}
