import { For, Show, Switch, Match, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { Markdown } from "@opencode/session-ui/markdown"
import type { MemoryCollection, MemoryDocument } from "@cybros/agent"
import type { NexusCommand } from "@opencode/protocol/nexus-command"
import type { ManagementClient } from "./client"
import { FieldRow } from "./fields"
import { filterMemory, groupMemory, memoryGroups, memoryPathError, skillNameError } from "./knowledge-model"

type Operation = Extract<typeof NexusCommand.Type, { action: "application.operation" }>["operation"]

const operation = <T,>(c: ManagementClient, input: Operation) =>
  c.command<T>({ action: "application.operation", operation: input })

export function Knowledge(props: { client: ManagementClient; selected?: string; select(id: string): void }) {
  const mode = () => (props.selected === "skills" ? "skills" : "memory")

  return (
    <section>
      <h2>Knowledge</h2>
      <p>Byte-stable memory pages and human-governed reusable skills for this workspace.</p>
      <div class="nexus-actions">
        <Button aria-pressed={mode() === "memory"} onClick={() => props.select("memory")}>
          Memory Wiki
        </Button>
        <Button aria-pressed={mode() === "skills"} onClick={() => props.select("skills")}>
          Skills
        </Button>
      </div>
      <Switch>
        <Match when={mode() === "skills"}>
          <SkillsPanel client={props.client} />
        </Match>
        <Match when={mode() === "memory"}>
          <MemoryWiki client={props.client} />
        </Match>
      </Switch>
      <div class="nexus-card">
        <h3>Personal Soul</h3>
        <p>Your account-wide standing instructions are edited in Settings under Persona.</p>
      </div>
    </section>
  )
}

function MemoryWiki(props: { client: ManagementClient }) {
  const c = props.client
  const dialog = useDialog()

  const [s, set] = createStore({
    collections: [] as MemoryCollection[],
    collection: "",
    rows: [] as MemoryDocument[],
    query: "",
    scope: "all",
    path: "",
    doc: null as MemoryDocument | null,
    draft: "",
    editing: false,
    removing: false,
  })

  const groups = () => groupMemory(filterMemory(s.rows, s.scope, s.query))

  const read = async (path: string) => {
    const collection = s.collection
    set({ path, editing: false, removing: false })
    const doc = await c.command<MemoryDocument>({ action: "memory.read", collection, path })
    if (s.collection !== collection || s.path !== path) return
    set({ doc, draft: doc.content ?? "" })
  }

  const list = async () => {
    const rows = await c.command<MemoryDocument[]>({ action: "memory.list", collection: s.collection })
    set("rows", rows)
    return rows
  }

  const refresh = async () => {
    const page = await c.command<{ items: MemoryCollection[] }>({ action: "memory.collections" })
    const collections = page.items.filter((row) => row.scope === "workspace" && !row.archived_at)
    set("collections", collections)
    const current =
      collections.find((row) => row.public_id === s.collection) ??
      collections.find((row) => row.is_default) ??
      collections[0]
    set("collection", current?.public_id ?? "")
    if (!current) return set({ rows: [], path: "", doc: null })
    const rows = await list()
    if (s.path && rows.some((row) => row.path === s.path)) {
      // An open edit owns its draft; a stale save surfaces the server's conflict instead.
      if (s.editing) return
      return read(s.path)
    }
    if (rows[0]) return read(rows[0].path)
    set({ path: "", doc: null })
  }

  onMount(() => void c.perform(refresh))

  const selectCollection = (collection: string) =>
    void c.perform(async () => {
      set({ collection, path: "", doc: null, draft: "", editing: false, removing: false })
      const rows = await list()
      if (rows[0]) await read(rows[0].path)
    })

  const save = () =>
    void c.perform(async () => {
      const doc = s.doc
      if (!doc) return
      const saved = await c.command<MemoryDocument>({
        action: "memory.write",
        collection: s.collection,
        path: doc.path,
        content: s.draft,
        id: doc.public_id,
        version: doc.lock_version,
      })
      c.notice("Saved " + doc.path + ".")
      set({ doc: saved, draft: saved.content ?? "", editing: false })
      await list()
    })

  const remove = () =>
    void c.perform(async () => {
      const doc = s.doc
      if (!doc) return
      await c.command({
        action: "memory.delete",
        collection: s.collection,
        path: doc.path,
        id: doc.public_id,
        version: doc.lock_version,
      })
      c.notice("Deleted " + doc.path + ".")
      set({ path: "", doc: null, draft: "", editing: false, removing: false })
      const rows = await list()
      if (rows[0]) await read(rows[0].path)
    })

  return (
    <>
      <div class="nexus-actions">
        <FieldRow label="Collection">
          <select
            value={s.collection}
            disabled={!s.collections.length}
            onChange={(e) => selectCollection(e.currentTarget.value)}
          >
            <Show when={!s.collections.length}>
              <option value="">No workspace collection</option>
            </Show>
            <For each={s.collections}>
              {(row) => (
                <option value={row.public_id} selected={row.public_id === s.collection}>
                  {row.name || row.public_id}
                </option>
              )}
            </For>
          </select>
        </FieldRow>
        <Button
          disabled={c.state.busy || !s.collection}
          onClick={() =>
            dialog.show(() => (
              <NewMemoryPage
                client={c}
                collection={s.collection}
                close={() => dialog.close()}
                created={async (path) => {
                  await list()
                  await read(path)
                }}
              />
            ))
          }
        >
          New page
        </Button>
        <Button disabled={c.state.busy} onClick={() => void c.perform(refresh)}>
          Refresh
        </Button>
      </div>
      <div class="nexus-actions">
        <FieldRow label="Filter memory paths">
          <input
            placeholder="Filter memory paths…"
            value={s.query}
            onInput={(e) => set("query", e.currentTarget.value)}
          />
        </FieldRow>
        <For each={["all", ...memoryGroups] as const}>
          {(scope) => (
            <Button size="small" aria-pressed={s.scope === scope} onClick={() => set("scope", scope)}>
              {scope === "all" ? "All" : scope + "/"}
            </Button>
          )}
        </For>
      </div>
      <Show when={s.collections.length > 0 && !s.rows.length}>
        <p>No memory pages yet. As you talk on the Personal Desk, durable notes appear here.</p>
      </Show>
      <For each={groups()}>
        {(group) => (
          <div class="nexus-card">
            <h3>{group.folder}/</h3>
            <For each={group.items}>
              {(row) => (
                <div class="nexus-actions">
                  <Button
                    size="small"
                    aria-pressed={row.path === s.path}
                    onClick={() => void c.perform(() => read(row.path))}
                  >
                    {row.path}
                  </Button>
                  <small>{row.bytesize}B</small>
                </div>
              )}
            </For>
          </div>
        )}
      </For>
      <Show when={s.doc} keyed>
        {(doc) => (
          <div class="nexus-card">
            <h3>{doc.path}</h3>
            <p>
              <small>{doc.bytesize} bytes</small>
            </p>
            <div class="nexus-actions">
              <Button onClick={() => set({ editing: !s.editing, removing: false })}>
                {s.editing ? "Preview" : "Edit"}
              </Button>
              <Show when={s.editing}>
                <Button disabled={c.state.busy} onClick={save}>
                  Save changes
                </Button>
              </Show>
              <Show
                when={s.removing}
                fallback={
                  <Button size="small" onClick={() => set("removing", true)}>
                    Delete
                  </Button>
                }
              >
                <Button size="small" disabled={c.state.busy} onClick={remove}>
                  Confirm delete
                </Button>
                <Button size="small" onClick={() => set("removing", false)}>
                  Cancel
                </Button>
              </Show>
            </div>
            <Show
              when={s.editing}
              fallback={<Markdown text={s.draft} />}
            >
              <textarea
                aria-label="Document content"
                rows={14}
                value={s.draft}
                onInput={(e) => set("draft", e.currentTarget.value)}
              />
            </Show>
          </div>
        )}
      </Show>
    </>
  )
}

function NewMemoryPage(props: {
  client: ManagementClient
  collection: string
  close(): void
  created(path: string): Promise<void>
}) {
  const c = props.client

  const [s, set] = createStore({ path: "speaker/", content: "# ", error: "" })

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const invalid = memoryPathError(s.path.trim())
    set("error", invalid)
    if (invalid) return
    void c.perform(async () => {
      await c.command({
        action: "memory.write",
        collection: props.collection,
        path: s.path.trim(),
        content: s.content,
        id: null,
        version: null,
      })
      c.notice("Created " + s.path.trim() + ".")
      props.close()
      await props.created(s.path.trim())
    })
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup
          title="New memory page"
          description="Write a durable Markdown page under speaker/, agent/ or workspace/."
        />
      </DialogHeader>
      <DialogBody>
        <form onSubmit={submit}>
          <Show when={s.error}>
            <p role="alert">{s.error}</p>
          </Show>
          <Show when={c.state.error}>
            <p role="alert">{c.state.error}</p>
          </Show>
          <FieldRow label="Logical path">
            <input
              required
              placeholder="speaker/profile.md or workspace/projects/alpha.md"
              value={s.path}
              onInput={(e) => set("path", e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Markdown content">
            <textarea required rows={8} value={s.content} onInput={(e) => set("content", e.currentTarget.value)} />
          </FieldRow>
          <div class="nexus-actions">
            <Button type="submit" disabled={c.state.busy}>
              Create page
            </Button>
            <Button type="button" onClick={props.close}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  )
}

type SkillRow = MemoryDocument & { name: string; scope: "agent" | "workspace" }

type SkillDraft = {
  public_id: string
  name: string
  scope: string
  description: string
  content: string
  conversation_public_id?: string
  workspace_public_id?: string
  created_at: string
  updated_at: string
}

function SkillsPanel(props: { client: ManagementClient }) {
  const c = props.client
  const dialog = useDialog()

  const [s, set] = createStore({
    drafts: [] as SkillDraft[],
    published: [] as SkillRow[],
    project: [] as { name: string; description?: string }[],
    selected: null as { scope: "agent" | "workspace"; name: string } | null,
    body: "",
    removing: false,
  })

  const refresh = async () => {
    const [skills, drafts] = await Promise.all([
      operation<{
        agent?: (MemoryDocument & { name: string })[]
        workspace?: (MemoryDocument & { name: string })[]
        project?: { name: string; description?: string }[]
      }>(c, { action: "skills" }),
      operation<{ skill_drafts?: SkillDraft[] }>(c, { action: "skills.drafts" }),
    ])
    set({
      published: [
        ...(skills.agent ?? []).map((row) => ({ ...row, scope: "agent" as const })),
        ...(skills.workspace ?? []).map((row) => ({ ...row, scope: "workspace" as const })),
      ],
      project: skills.project ?? [],
      drafts: drafts.skill_drafts ?? [],
    })
  }

  onMount(() => void c.perform(refresh))

  const inspect = async (scope: "agent" | "workspace", name: string) => {
    set({ selected: { scope, name }, removing: false })
    const doc = await operation<MemoryDocument | null>(c, { action: "skill.show", scope, name })
    if (s.selected?.scope !== scope || s.selected?.name !== name) return
    set("body", doc?.content ?? "")
  }

  const approve = (draft: SkillDraft) =>
    void c.perform(async () => {
      await operation(c, {
        action: "skills.drafts.approve",
        public_id: draft.public_id,
        ...(draft.scope === "workspace" ? { workspace: c.workspace() } : {}),
      })
      c.notice("Published /" + draft.name + ".")
      await refresh()
      await inspect(draft.scope === "workspace" ? "workspace" : "agent", draft.name)
    })

  const dismiss = (draft: SkillDraft) =>
    void c.perform(async () => {
      await operation(c, { action: "skills.drafts.dismiss", public_id: draft.public_id })
      c.notice("Dismissed draft " + draft.name + ".")
      await refresh()
    })

  const remove = () =>
    void c.perform(async () => {
      const selected = s.selected
      if (!selected) return
      await operation(c, { action: "skill.remove", scope: selected.scope, name: selected.name })
      c.notice("Removed /" + selected.name + ".")
      set({ selected: null, body: "", removing: false })
      await refresh()
    })

  const author = (seed?: { scope: "agent" | "workspace"; name: string; description: string; content: string }) =>
    dialog.show(() => (
      <AuthorSkill
        client={c}
        seed={seed}
        close={() => dialog.close()}
        saved={async (scope, name) => {
          await refresh()
          await inspect(scope, name)
        }}
      />
    ))

  return (
    <>
      <div class="nexus-actions">
        <Button onClick={() => author()}>Author skill</Button>
        <Button disabled={c.state.busy} onClick={() => void c.perform(refresh)}>
          Refresh
        </Button>
      </div>
      <Show when={s.drafts.length}>
        <div class="nexus-card">
          <h3>Proposed skill drafts awaiting review ({s.drafts.length})</h3>
          <For each={s.drafts}>
            {(draft) => (
              <article class="nexus-card">
                <h3>/{draft.name}</h3>
                <p>
                  <small>{draft.scope === "agent" ? "Personal" : "Workspace"} skill</small>
                </p>
                <p>{draft.description}</p>
                <details>
                  <summary>Inspect skill instructions</summary>
                  <Markdown text={draft.content} />
                </details>
                <div class="nexus-actions">
                  <Button disabled={c.state.busy} onClick={() => approve(draft)}>
                    Approve
                  </Button>
                  <Button disabled={c.state.busy} onClick={() => dismiss(draft)}>
                    Dismiss
                  </Button>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>
      <h3>Published skills ({s.published.length})</h3>
      <Show when={!s.published.length}>
        <p>No published skills yet. Ask the agent to draft a reusable workflow, or author one above.</p>
      </Show>
      <For each={s.published}>
        {(row) => (
          <div class="nexus-actions">
            <Button
              size="small"
              aria-pressed={s.selected?.scope === row.scope && s.selected?.name === row.name}
              onClick={() => void c.perform(() => inspect(row.scope, row.name))}
            >
              /{row.name}
            </Button>
            <small>{row.scope === "agent" ? "Personal" : "Workspace"}</small>
            <Show when={row.description}>
              <small>{row.description}</small>
            </Show>
          </div>
        )}
      </For>
      <Show when={s.project.length}>
        <h3>Environment checkout skills</h3>
        <For each={s.project}>
          {(row) => (
            <p>
              /{row.name}
              <Show when={row.description}>
                <small> {row.description}</small>
              </Show>
            </p>
          )}
        </For>
      </Show>
      <Show when={s.selected} keyed>
        {(selected) => (
          <div class="nexus-card">
            <h3>/{selected.name}</h3>
            <p>
              <small>{selected.scope === "agent" ? "Personal skill" : "Workspace skill"}</small>
            </p>
            <div class="nexus-actions">
              <Button
                onClick={() =>
                  author({
                    scope: selected.scope,
                    name: selected.name,
                    description:
                      s.published.find((row) => row.scope === selected.scope && row.name === selected.name)
                        ?.description ?? "",
                    content: s.body,
                  })
                }
              >
                Edit
              </Button>
              <Show
                when={s.removing}
                fallback={
                  <Button size="small" onClick={() => set("removing", true)}>
                    Remove
                  </Button>
                }
              >
                <Button size="small" disabled={c.state.busy} onClick={remove}>
                  Confirm remove
                </Button>
                <Button size="small" onClick={() => set("removing", false)}>
                  Cancel
                </Button>
              </Show>
            </div>
            <Markdown text={s.body} />
          </div>
        )}
      </Show>
    </>
  )
}

function AuthorSkill(props: {
  client: ManagementClient
  seed?: { scope: "agent" | "workspace"; name: string; description: string; content: string }
  close(): void
  saved(scope: "agent" | "workspace", name: string): Promise<void>
}) {
  const c = props.client

  const [s, set] = createStore({
    scope: props.seed?.scope ?? ("agent" as "agent" | "workspace"),
    name: props.seed?.name ?? "",
    description: props.seed?.description ?? "",
    content: props.seed?.content ?? "",
    error: "",
  })

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const invalid = skillNameError(s.name.trim())
    set("error", invalid)
    if (invalid) return
    void c.perform(async () => {
      await operation(c, {
        action: "skill.push",
        scope: s.scope,
        name: s.name.trim(),
        description: s.description,
        content: s.content,
      })
      c.notice("Saved /" + s.name.trim() + ".")
      props.close()
      await props.saved(s.scope, s.name.trim())
    })
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup
          title="Author or update skill"
          description="Publish reusable instructions into the Personal (agent) or Workspace skill catalog."
        />
      </DialogHeader>
      <DialogBody>
        <form onSubmit={submit}>
          <Show when={s.error}>
            <p role="alert">{s.error}</p>
          </Show>
          <Show when={c.state.error}>
            <p role="alert">{c.state.error}</p>
          </Show>
          <FieldRow label="Scope">
            <select
              value={s.scope}
              disabled={!!props.seed}
              onChange={(e) => set("scope", e.currentTarget.value as "agent" | "workspace")}
            >
              <option value="agent">Personal (agent)</option>
              <option value="workspace">Shared (workspace)</option>
            </select>
          </FieldRow>
          <FieldRow label="Skill slug">
            <input
              required
              placeholder="weekly-brief"
              value={s.name}
              onInput={(e) => set("name", e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Short catalog description">
            <input
              required
              placeholder="When the agent should load and follow this skill"
              value={s.description}
              onInput={(e) => set("description", e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Markdown instructions">
            <textarea required rows={8} value={s.content} onInput={(e) => set("content", e.currentTarget.value)} />
          </FieldRow>
          <div class="nexus-actions">
            <Button type="submit" disabled={c.state.busy}>
              Publish skill
            </Button>
            <Button type="button" onClick={props.close}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  )
}
