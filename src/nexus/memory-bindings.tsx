import { For, Show, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import type { MemoryBinding, MemoryBindings, MemoryCollection, MemorySelection, MemorySource } from "@cybros/agent"
import { request, type ChatController } from "./controller"
import { FieldRow } from "../management/fields"

type View = {
  selection: (MemorySelection & { automatic?: boolean }) | null
  effective: MemoryBindings
  writable: boolean
}

const scopes = ["conversation", "workspace", "agent", "speaker"] as const

export function MemoryBindings(props: { chat: ChatController; saved(): void }) {
  const c = props.chat
  const scope = c.s.connection!.scope
  const path = "/chats/" + encodeURIComponent(c.s.id)
  const abort = new AbortController()
  onCleanup(() => abort.abort())

  const [s, set] = createStore({
    ready: false,
    writable: false,
    mode: "automatic",
    bindings: [] as MemoryBinding[],
    effective: [] as MemoryBindings["bindings"],
    collections: [] as MemoryCollection[],
    catalog: false,
    after: null as string | null,
    loading: false,
    error: "",
  })

  const collections = async () => {
    set("loading", true)

    try {
      const page = await request<{ items: MemoryCollection[]; next_after: string | null }>(
        path + "/memory-collections" + (s.after ? "?after=" + encodeURIComponent(s.after) : ""),
        scope,
        undefined,
        abort.signal,
      )

      set({ collections: [...s.collections, ...page.items], after: page.next_after, catalog: true })
    } finally {
      set("loading", false)
    }
  }

  const failed = (error: unknown) => {
    if (!abort.signal.aborted) set("error", error instanceof Error ? error.message : String(error))
  }

  onMount(
    () =>
      void (async () => {
        const view = await request<View>(path + "/memory", scope, undefined, abort.signal)
        const automatic = !view.selection || view.selection.automatic
        set({
          ready: true,
          writable: view.writable,
          mode: automatic ? "automatic" : view.selection!.bindings.length ? "custom" : "disabled",
          bindings: automatic
            ? scopes.map((scope) => ({ name: scope, source: { scope }, access: "read_write" }))
            : view.selection!.bindings,
          effective: view.effective.bindings,
        })
        await collections()
      })().catch(failed),
  )

  return (
    <form
      class="chat-inspect"
      onSubmit={(event) => {
        event.preventDefault()

        if (!s.ready || !s.writable) return

        if (
          s.mode === "custom" &&
          (!s.bindings.length || new Set(s.bindings.map((row) => row.name)).size !== s.bindings.length)
        ) {
          set("error", "Custom bindings need unique names and at least one source.")

          return
        }

        const selection = s.mode === "automatic" ? null : { bindings: s.mode === "disabled" ? [] : s.bindings }
        void c.command("memory", { selection }).then((saved) => {
          if (saved) props.saved()
        })
      }}
    >
      <p>Choose memory sources for future replies. A binding does not grant access to a collection.</p>
      <Show when={!s.ready}>
        <p>Loading memory bindings…</p>
      </Show>
      <Show when={s.ready && !s.writable}>
        <p>This conversation is read-only.</p>
      </Show>
      <Show when={s.error || c.s.error}>
        <p role="alert">{s.error || c.s.error}</p>
      </Show>
      <fieldset disabled={!s.ready || !s.writable || c.s.sending}>
        <FieldRow label="Memory selection">
          <select value={s.mode} onChange={(event) => set("mode", event.currentTarget.value)}>
            <option value="automatic" selected={s.mode === "automatic"}>
              Automatic
            </option>
            <option value="custom" selected={s.mode === "custom"}>
              Custom
            </option>
            <option value="disabled" selected={s.mode === "disabled"}>
              Disabled
            </option>
          </select>
        </FieldRow>
        <Show when={s.mode === "custom"}>
          <For each={s.bindings}>
            {(binding, index) => {
              const selected = () =>
                binding.source.collection_public_id
                  ? "collection:" + binding.source.collection_public_id
                  : "scope:" + binding.source.scope

              return (
                <fieldset aria-label={"Binding " + (index() + 1)} class="nexus-card">
                  <FieldRow label="Name">
                    <input
                      required
                      pattern="[a-z](?:[a-z0-9_]|-){0,31}"
                      maxLength={32}
                      value={binding.name}
                      onInput={(event) => set("bindings", index(), "name", event.currentTarget.value)}
                    />
                  </FieldRow>
                  <FieldRow label="Source">
                    <select
                      value={selected()}
                      onChange={(event) =>
                        set("bindings", index(), { ...binding, source: memorySource(event.currentTarget.value) })
                      }
                    >
                      <For each={[...scopes, ...(binding.source.scope === "user" ? ["user"] : [])]}>
                        {(scope) => (
                          <option value={"scope:" + scope} selected={selected() === "scope:" + scope}>
                            Default {scope}
                          </option>
                        )}
                      </For>
                      <Show
                        when={
                          binding.source.collection_public_id &&
                          !s.collections.some((row) => row.public_id === binding.source.collection_public_id)
                        }
                      >
                        <option value={selected()} selected>
                          {binding.source.collection_public_id}
                        </option>
                      </Show>
                      <For each={s.collections}>
                        {(row) => (
                          <option
                            value={"collection:" + row.public_id}
                            selected={selected() === "collection:" + row.public_id}
                          >
                            {row.name || (row.is_default ? "Default collection" : "Unnamed collection")} · {row.scope} ·{" "}
                            {row.public_id}
                          </option>
                        )}
                      </For>
                    </select>
                  </FieldRow>
                  <Show when={binding.source.scope === "conversation" || binding.source.scope === "speaker"}>
                    <FieldRow label="Subject ID (optional)">
                      <input
                        value={binding.source.conversation_public_id ?? binding.source.speaker_public_id ?? ""}
                        onInput={(event) => {
                          const value = event.currentTarget.value.trim()

                          const source: MemorySource =
                            binding.source.scope === "conversation"
                              ? { scope: "conversation", ...(value ? { conversation_public_id: value } : {}) }
                              : { scope: "speaker", ...(value ? { speaker_public_id: value } : {}) }

                          set("bindings", index(), { ...binding, source })
                        }}
                      />
                    </FieldRow>
                  </Show>
                  <FieldRow label="Access">
                    <select
                      value={binding.access}
                      onChange={(event) =>
                        set("bindings", index(), "access", event.currentTarget.value === "read" ? "read" : "read_write")
                      }
                    >
                      <option value="read" selected={binding.access === "read"}>
                        Read only
                      </option>
                      <option value="read_write" selected={binding.access === "read_write"}>
                        Read and write
                      </option>
                    </select>
                  </FieldRow>
                  <Button
                    type="button"
                    onClick={() =>
                      set(
                        "bindings",
                        s.bindings.filter((_, row) => row !== index()),
                      )
                    }
                  >
                    Remove binding {index() + 1}
                  </Button>
                </fieldset>
              )
            }}
          </For>
          <Button
            type="button"
            disabled={s.bindings.length >= 16}
            onClick={() =>
              set("bindings", [...s.bindings, { name: "", source: { scope: "workspace" }, access: "read" }])
            }
          >
            Add binding
          </Button>
        </Show>
      </fieldset>
      <Show when={s.mode === "custom" && (!s.catalog || s.after)}>
        <Button type="button" disabled={s.loading} onClick={() => void collections().catch(failed)}>
          Load more collections
        </Button>
      </Show>
      <h3>Effective memory sources</h3>
      <For each={s.effective} fallback={<p>No effective memory sources.</p>}>
        {(binding) => (
          <p>
            {binding.name}/ · {binding.scope} · {binding.access === "read_write" ? "Read and write" : "Read only"} ·{" "}
            {binding.state}
            {binding.collection_public_id && " · " + binding.collection_public_id}
          </p>
        )}
      </For>
      <Show when={s.writable}>
        <Button type="submit" disabled={!s.ready || c.s.sending}>
          Save memory bindings
        </Button>
      </Show>
    </form>
  )
}

function memorySource(value: string): MemorySource {
  if (value.startsWith("collection:")) return { collection_public_id: value.slice("collection:".length) }

  if (value === "scope:conversation") return { scope: "conversation" }

  if (value === "scope:speaker") return { scope: "speaker" }

  if (value === "scope:agent") return { scope: "agent" }

  if (value === "scope:user") return { scope: "user" }

  return { scope: "workspace" }
}
