import { expect, test, type Page } from "@playwright/test"

type Command = { action: string; [key: string]: unknown }

async function fixture(page: Page, command: (input: Command) => unknown | Promise<unknown>) {
  await page.route("**/api/7777/**", async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.includes("/modules/")) return route.fallback()

    if (url.pathname.endsWith("/setup"))
      return route.fulfill({
        json: {
          status: { state: "ready", origin: "https://nexus.example", error: null },
          account: { id: "human", role: "admin" },
        },
      })

    if (url.pathname.endsWith("/connection")) {
      const workspace = url.searchParams.get("workspace") ?? "one"

      return route.fulfill({
        json: {
          scope: JSON.stringify(["https://nexus.example", "human", workspace, "agent"]),
          user: "Human",
          agent: "OpenCode",
          workspace,
          model: "provider/model",
          runner: "runner",
        },
      })
    }

    if (url.pathname.endsWith("/choices"))
      return route.fulfill({
        json: {
          models: ["provider/model"],
          runners: [{ id: "runner", name: "Local" }],
          approvals: ["ask", "rules", "bypass"],
          modes: { available: true, code_mode: true, subagent: true, code_mode_available: true },
        },
      })

    if (/\/chats\/[^/]+$/.test(url.pathname))
      return route.fulfill({
        json: {
          turns: [],
          pending: [],
          busy: false,
          decisions: [],
          problem: null,
          detail: {
            title: "Navigation chat",
            runner: "runner",
            archived: false,
            owned: false,
            active: null,
            version: 0,
          },
        },
      })

    if (url.pathname.endsWith("/stream"))
      return route.fulfill({ contentType: "text/event-stream", body: "event: ready\ndata: {}\n\n" })

    if (url.pathname.endsWith("/chats"))
      return route.fulfill({ json: { items: [{ id: "conversation", title: "Fixture" }], next: null } })

    if (url.pathname.endsWith("/settings/kernel-tools")) return route.fulfill({ json: [] })

    if (url.pathname.endsWith("/manage")) {
      const input = route.request().postDataJSON() as Command

      if (input.action === "workspace.list")
        return route.fulfill({
          json: {
            items: [{ public_id: "one", name: "First workspace", dedicated: true }],
          },
        })

      if (input.action === "extension.list") return route.fulfill({ json: [] })

      const result = await command(input)
      if (result instanceof Error) return route.fulfill({ status: 503, json: { error: result.message } })
      return route.fulfill({ json: result })
    }

    return route.fulfill({ json: {} })
  })
  await page.goto("/component-tests/nexus-chat.html")
  await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue("one")
}

function channelSource(overrides: Record<string, unknown> = {}) {
  return {
    source_key: "webhook:github",
    name: "GitHub Notifications",
    kind: "webhook",
    enabled: true,
    target: "personal",
    accept_mode: "observe",
    allowed_senders: [] as string[],
    allowed_bots: [] as string[],
    updated_at: "2030-01-01T00:00:00Z",
    ...overrides,
  }
}

function outboxMessage(overrides: Record<string, unknown> = {}) {
  return {
    public_id: "out-1",
    conversation_public_id: "conversation",
    channel_key: "telegram:bot",
    thread_key: "thread-9",
    purpose: "answer",
    status: "pending",
    body: "Deploy finished",
    metadata: {},
    attempts_count: 2,
    last_error: "timeout",
    dropped_reason: null,
    next_attempt_at: "2030-01-01T00:05:00Z",
    sent_at: null,
    dropped_at: null,
    created_at: "2030-01-01T00:00:00Z",
    ...overrides,
  }
}

function observation(overrides: Record<string, unknown> = {}) {
  return {
    public_id: "obs-1",
    source_key: "webhook:github",
    external_id: "evt-1",
    thread_key: "thread-1",
    decision: "would_accept",
    matched_rules: ["invoice-watch"],
    preview: "Invoice #2026-11 arrived",
    observed_at: "2030-01-01T00:00:00Z",
    ...overrides,
  }
}

test("channel source cards upsert the gate mode and list workspace peers read-only", async ({ page }) => {
  const operations: Command[] = []
  let source = channelSource()
  await fixture(page, (input) => {
    if (input.action === "bot.list")
      return [
        {
          public_id: "bot-1",
          name: "reviewer",
          handle: "reviewer",
          display_name: "Review Bot",
          description: "Reviews changes",
          settings: { audience: "owner", preset_public_id: "default", home_workspace_public_id: null, subagent: true, welcome_message: null },
        },
      ]
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "channels")
      return {
        channels: {
          sources: [source],
          event_rules: [],
          attention_policy: { quiet_hours: { enabled: false, start: "22:00", end: "08:00", time_zone: "UTC" }, daily_proactive_limit: 10 },
          observations: [],
          desks: {},
          active_adapters: ["telegram"],
          outbox_messages: [],
        },
      }
    if (op.action === "channels.source") {
      source = channelSource({ accept_mode: op.accept_mode, enabled: op.enabled })
      return { source }
    }
    return {}
  })
  await page.getByRole("button", { name: "Channels", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Channels", exact: true })
  await expect(panel.getByRole("heading", { name: "GitHub Notifications" })).toBeVisible()
  await expect(panel.getByText("webhook:github", { exact: true })).toBeVisible()
  await expect(panel.getByText(/routes to Personal Desk \(owner\)/)).toBeVisible()
  await expect(panel.getByText("Active outbound adapters: telegram")).toBeVisible()
  await expect(panel.getByRole("button", { name: "observe", exact: true })).toHaveAttribute("aria-pressed", "true")
  await panel.getByRole("button", { name: "auto", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "channels.source").length).toBe(1)
  expect(operations.find((op) => op.action === "channels.source")).toEqual({
    action: "channels.source",
    source_key: "webhook:github",
    name: "GitHub Notifications",
    kind: "webhook",
    enabled: true,
    target: "personal",
    accept_mode: "auto",
    allowed_senders: [],
    allowed_bots: [],
  })
  await expect(panel.getByRole("button", { name: "auto", exact: true })).toHaveAttribute("aria-pressed", "true")
  await panel.getByRole("button", { name: "Disable", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "channels.source").length).toBe(2)
  expect(operations.filter((op) => op.action === "channels.source").at(-1)).toMatchObject({
    enabled: false,
    accept_mode: "auto",
  })
  await expect(panel.getByRole("button", { name: "Enable", exact: true })).toBeVisible()

  await panel.getByRole("button", { name: "Telegram", exact: true }).click()
  await expect(panel.getByRole("heading", { name: "Telegram reach" })).toBeVisible()
  await expect(panel.getByText(/Open the Integrations panel and choose Telegram/)).toBeVisible()

  await panel.getByRole("button", { name: "Peers", exact: true }).click()
  await expect(panel.getByRole("heading", { name: "Scoped peers" })).toBeVisible()
  await expect(panel.getByText(/created and configured in the Bots panel/)).toBeVisible()
  await expect(panel.getByRole("heading", { name: "Review Bot" })).toBeVisible()
  await expect(panel.getByText("@reviewer · owner")).toBeVisible()
})

test("adding and removing a channel source validates input and refreshes the overview", async ({ page }) => {
  const operations: Command[] = []
  let sources = [channelSource()]
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "channels")
      return {
        channels: {
          sources,
          event_rules: [],
          attention_policy: {},
          observations: [],
          desks: {},
          active_adapters: [],
          outbox_messages: [],
        },
      }
    if (op.action === "channels.source") {
      sources = [...sources.filter((row) => row.source_key !== op.source_key), channelSource(op)]
      return { source: op }
    }
    if (op.action === "channels.source.rm") {
      sources = sources.filter((row) => row.source_key !== op.source_key)
      return { removed: op.source_key }
    }
    return {}
  })
  await page.getByRole("button", { name: "Channels", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Channels", exact: true })
  await expect(panel.getByRole("heading", { name: "GitHub Notifications" })).toBeVisible()

  await panel.getByRole("button", { name: "Add source", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Add channel source", exact: true })
  await dialog.getByRole("textbox", { name: "Source key", exact: true }).fill("Webhook BAD")
  await dialog.getByRole("textbox", { name: "Display name", exact: true }).fill("Inbox")
  await dialog.getByRole("button", { name: "Save source", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Source key must match")
  expect(operations.filter((op) => op.action === "channels.source")).toHaveLength(0)
  await dialog.getByRole("textbox", { name: "Source key", exact: true }).fill("webhook:inbox")
  await dialog.getByRole("combobox", { name: "Initial gate mode", exact: true }).selectOption("auto")
  await dialog.getByRole("textbox", { name: "Allowed senders", exact: true }).fill("alice, bob")
  await dialog.getByRole("textbox", { name: "Allowed bots", exact: true }).fill("triage")
  await dialog.getByRole("button", { name: "Save source", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => operations.filter((op) => op.action === "channels.source").length).toBe(1)
  expect(operations.find((op) => op.action === "channels.source")).toEqual({
    action: "channels.source",
    source_key: "webhook:inbox",
    name: "Inbox",
    kind: "webhook",
    enabled: true,
    target: "personal",
    accept_mode: "auto",
    allowed_senders: ["alice", "bob"],
    allowed_bots: ["triage"],
  })
  await expect(panel.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible()

  await panel.getByRole("button", { name: "Remove", exact: true }).first().click()
  await panel.getByRole("button", { name: "Confirm remove", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "channels.source.rm").length).toBe(1)
  expect(operations.find((op) => op.action === "channels.source.rm")).toEqual({
    action: "channels.source.rm",
    source_key: "webhook:github",
  })
  await expect(panel.getByRole("heading", { name: "GitHub Notifications" })).toHaveCount(0)
})

test("a simulated event posts channels.ingest and shows the gate outcome", async ({ page }) => {
  const operations: Command[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "channels")
      return {
        channels: {
          sources: [channelSource()],
          event_rules: [],
          attention_policy: {},
          observations: [],
          desks: {},
          active_adapters: [],
          outbox_messages: [],
        },
      }
    if (op.action === "channels.ingest")
      return {
        outcome: "routed",
        strength: "explicit",
        fanned_out_conversation_public_ids: [],
        routed_conversation_public_id: "desk",
      }
    return {}
  })
  await page.getByRole("button", { name: "Channels", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Channels", exact: true })
  await expect(panel.getByRole("heading", { name: "GitHub Notifications" })).toBeVisible()
  await panel.getByRole("button", { name: "Simulate event", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Simulate incoming event", exact: true })
  await expect(dialog.getByLabel("Source key", { exact: true })).toHaveValue("webhook:github")
  await expect(dialog.getByRole("checkbox", { name: "Addressed to the agent", exact: true })).toBeChecked()
  await dialog.getByRole("textbox", { name: "Event text", exact: true }).fill("Invoice #2026-11 arrived")
  await dialog.getByRole("button", { name: "Send event", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => operations.filter((op) => op.action === "channels.ingest").length).toBe(1)
  const ingest = operations.find((op) => op.action === "channels.ingest")!
  expect(ingest).toMatchObject({
    source_key: "webhook:github",
    thread_key: "thread-1",
    text: "Invoice #2026-11 arrived",
    addressed: true,
  })
  expect(String(ingest.external_id)).toMatch(/^evt-/)
  await expect(panel.getByRole("status").filter({ hasText: "Event outcome" })).toContainText("routed · explicit")
})

test("the outbox lists pending replies, drains with settlements and shows gate observations", async ({ page }) => {
  const operations: Command[] = []
  let outbox = [outboxMessage()]
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "channels")
      return {
        channels: {
          sources: [channelSource()],
          event_rules: [],
          attention_policy: {},
          observations: [observation()],
          desks: {},
          active_adapters: [],
          outbox_messages: outbox,
        },
      }
    if (op.action === "channels.outbox.drain") {
      outbox = []
      return { settlements: [{ public_id: "out-1", outcome: "sent" }] }
    }
    return {}
  })
  await page.getByRole("button", { name: "Channels", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Channels", exact: true })
  await expect(panel.getByRole("heading", { name: "Durable outbox" })).toBeVisible()
  await expect(panel.getByText("telegram:bot · thread-9")).toBeVisible()
  await expect(panel.getByText("Deploy finished")).toBeVisible()
  await expect(panel.getByText(/answer · 2 attempts · timeout/)).toBeVisible()

  await expect(panel.getByRole("heading", { name: "Recent gate decisions" })).toBeVisible()
  await expect(panel.getByText("would_accept")).toBeVisible()
  await expect(panel.getByText("Matched rules: invoice-watch")).toBeVisible()
  await expect(panel.getByText("Invoice #2026-11 arrived")).toBeVisible()

  await panel.getByRole("button", { name: "Drain now", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "channels.outbox.drain").length).toBe(1)
  expect(operations.find((op) => op.action === "channels.outbox.drain")).toEqual({ action: "channels.outbox.drain" })
  await expect(panel.getByRole("status").filter({ hasText: "out-1" })).toContainText("out-1 · sent")
  await expect(panel.getByText("Outbox is empty.")).toBeVisible()
})

function memoryCollection(overrides: Record<string, unknown> = {}) {
  return {
    public_id: "col-1",
    name: "Workspace memory",
    description: null,
    scope: "workspace",
    owner_public_id: "one",
    speaker_public_id: null,
    is_default: true,
    archived_at: null,
    lock_version: 1,
    created_at: "2030-01-01T00:00:00Z",
    updated_at: "2030-01-01T00:00:00Z",
    writable: true,
    manageable: true,
    ...overrides,
  }
}

function memoryDocument(path: string, overrides: Record<string, unknown> = {}) {
  return {
    collection_public_id: "col-1",
    public_id: "doc-" + path,
    lock_version: 3,
    path,
    bytesize: 24,
    description: null,
    content: "Notes for " + path + ".\n\nLikes tea.",
    written_at: "2030-01-01T00:00:00Z",
    ...overrides,
  }
}

function memoryFixture(initial: string[] = ["speaker/profile.md", "workspace/notes.md", "misc.txt"]) {
  const state = {
    documents: new Map(initial.map((path) => [path, memoryDocument(path)])),
    writes: [] as Command[],
    deletes: [] as Command[],
    failNextWrite: "",
  }
  const command = (input: Command): unknown => {
    if (input.action === "memory.collections") return { items: [memoryCollection()] }
    if (input.action === "memory.list")
      return [...state.documents.values()].map((doc) => ({ ...doc, content: null }))
    if (input.action === "memory.read") return state.documents.get(String(input.path)) ?? new Error("No document")
    if (input.action === "memory.write") {
      if (state.failNextWrite) return new Error(state.failNextWrite)
      state.writes.push(input)
      const existing = state.documents.get(String(input.path))
      const saved = memoryDocument(String(input.path), {
        content: input.content,
        public_id: existing?.public_id ?? "doc-new-" + String(input.path),
        lock_version: existing ? Number(existing.lock_version) + 1 : 1,
      })
      state.documents.set(String(input.path), saved)
      return saved
    }
    if (input.action === "memory.delete") {
      state.deletes.push(input)
      state.documents.delete(String(input.path))
      return null
    }
    return {}
  }
  return { state, command }
}

test("the memory wiki groups documents, reads a page and saves edits with CAS fields", async ({ page }) => {
  const { state, command } = memoryFixture()
  await fixture(page, command)
  await page.getByRole("button", { name: "Knowledge", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Knowledge", exact: true })
  await expect(panel.getByRole("heading", { name: "speaker/", exact: true })).toBeVisible()
  await expect(panel.getByRole("heading", { name: "workspace/", exact: true })).toBeVisible()
  await expect(panel.getByRole("heading", { name: "other/", exact: true })).toBeVisible()
  await expect(panel.getByRole("heading", { name: "conversation/", exact: true })).toHaveCount(0)
  // The first document opens in the reader.
  await expect(panel.getByRole("heading", { name: "speaker/profile.md", exact: true })).toBeVisible()
  await expect(panel.getByText("Likes tea.")).toBeVisible()

  await panel.getByRole("button", { name: "workspace/notes.md", exact: true }).click()
  await expect(panel.getByRole("heading", { name: "workspace/notes.md", exact: true })).toBeVisible()

  await panel.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = panel.getByRole("textbox", { name: "Document content", exact: true })
  await expect(editor).toHaveValue("Notes for workspace/notes.md.\n\nLikes tea.")
  await editor.fill("Notes for workspace/notes.md.\n\nPrefers concise answers.")
  await panel.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]).toEqual({
    action: "memory.write",
    collection: "col-1",
    path: "workspace/notes.md",
    content: "Notes for workspace/notes.md.\n\nPrefers concise answers.",
    id: "doc-workspace/notes.md",
    version: 3,
  })
  await expect(panel.getByText("Prefers concise answers.")).toBeVisible()
  await expect(editor).toHaveCount(0)

  await panel.getByRole("textbox", { name: "Filter memory paths", exact: true }).fill("misc")
  await expect(panel.getByRole("heading", { name: "speaker/", exact: true })).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "misc.txt", exact: true })).toBeVisible()
})

test("a stale memory write surfaces the conflict and keeps the draft", async ({ page }) => {
  const { state, command } = memoryFixture(["speaker/profile.md"])
  await fixture(page, command)
  await page.getByRole("button", { name: "Knowledge", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Knowledge", exact: true })
  await panel.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = panel.getByRole("textbox", { name: "Document content", exact: true })
  await editor.fill("My unsaved draft")
  state.failNextWrite = "This memory document changed. Refresh to load the latest version."
  await panel.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect(panel.getByRole("alert")).toContainText("This memory document changed")
  await expect(editor).toHaveValue("My unsaved draft")
  await expect(panel.getByRole("button", { name: "Save changes", exact: true })).toBeVisible()
  expect(state.writes).toHaveLength(0)
})

test("new memory pages validate their path before writing with null CAS fields", async ({ page }) => {
  const { state, command } = memoryFixture(["speaker/profile.md"])
  await fixture(page, command)
  await page.getByRole("button", { name: "Knowledge", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Knowledge", exact: true })
  await expect(panel.getByRole("heading", { name: "speaker/profile.md", exact: true })).toBeVisible()
  await panel.getByRole("button", { name: "New page", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "New memory page", exact: true })
  await dialog.getByRole("textbox", { name: "Logical path", exact: true }).fill("/abs/path.md")
  await dialog.getByRole("button", { name: "Create page", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("leading /")
  await dialog.getByRole("textbox", { name: "Logical path", exact: true }).fill("speaker/../escape.md")
  await dialog.getByRole("button", { name: "Create page", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("plain names")
  expect(state.writes).toHaveLength(0)
  await dialog.getByRole("textbox", { name: "Logical path", exact: true }).fill("speaker/preferences.md")
  await dialog.getByRole("textbox", { name: "Markdown content", exact: true }).fill("# Preferences")
  await dialog.getByRole("button", { name: "Create page", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]).toEqual({
    action: "memory.write",
    collection: "col-1",
    path: "speaker/preferences.md",
    content: "# Preferences",
    id: null,
    version: null,
  })
  await expect(panel.getByRole("heading", { name: "speaker/preferences.md", exact: true })).toBeVisible()
})

test("deleting a memory page sends its CAS fields and clears the reader", async ({ page }) => {
  const { state, command } = memoryFixture(["speaker/profile.md"])
  await fixture(page, command)
  await page.getByRole("button", { name: "Knowledge", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Knowledge", exact: true })
  await expect(panel.getByRole("heading", { name: "speaker/profile.md", exact: true })).toBeVisible()
  await panel.getByRole("button", { name: "Delete", exact: true }).click()
  await panel.getByRole("button", { name: "Confirm delete", exact: true }).click()
  await expect.poll(() => state.deletes.length).toBe(1)
  expect(state.deletes[0]).toEqual({
    action: "memory.delete",
    collection: "col-1",
    path: "speaker/profile.md",
    id: "doc-speaker/profile.md",
    version: 3,
  })
  await expect(panel.getByText("No memory pages yet.")).toBeVisible()
  await expect(panel.getByRole("heading", { name: "speaker/profile.md", exact: true })).toHaveCount(0)
})

function skillDocument(name: string, overrides: Record<string, unknown> = {}) {
  return {
    collection_public_id: "col-skills",
    public_id: "skill-" + name,
    lock_version: 2,
    path: "skills/" + name,
    name,
    bytesize: 21,
    description: "Weekly summary",
    content: "Run the weekly rollup.",
    written_at: "2030-01-01T00:00:00Z",
    ...overrides,
  }
}

test("skill drafts approve with the workspace for workspace scope and dismiss", async ({ page }) => {
  const operations: Command[] = []
  let drafts = [
    {
      public_id: "draft-1",
      name: "weekly-brief",
      scope: "agent",
      description: "Weekly summary",
      content: "Summarize the week.",
      created_at: "2030-01-01T00:00:00Z",
      updated_at: "2030-01-01T00:00:00Z",
    },
    {
      public_id: "draft-2",
      name: "team-review",
      scope: "workspace",
      description: "Team review",
      content: "Review the team board.",
      workspace_public_id: "one",
      created_at: "2030-01-01T00:00:00Z",
      updated_at: "2030-01-01T00:00:00Z",
    },
  ]
  const published: ReturnType<typeof skillDocument>[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "skills")
      return { agent: published.filter((row) => row.path.startsWith("skills/")), workspace: [], project: [{ name: "checkout-skill", description: "From the checkout" }], collections: {} }
    if (op.action === "skills.drafts") return { skill_drafts: drafts }
    if (op.action === "skills.drafts.approve") {
      const draft = drafts.find((row) => row.public_id === op.public_id)!
      drafts = drafts.filter((row) => row.public_id !== op.public_id)
      published.push(skillDocument(draft.name, { description: draft.description, content: draft.content }))
      return { memory: published.at(-1), approved_draft_public_id: draft.public_id }
    }
    if (op.action === "skills.drafts.dismiss") {
      drafts = drafts.filter((row) => row.public_id !== op.public_id)
      return { dismissed: { public_id: op.public_id } }
    }
    if (op.action === "skill.show") return published.find((row) => row.name === op.name) ?? null
    return {}
  })
  await page.getByRole("button", { name: "Knowledge", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Knowledge", exact: true })
  await panel.getByRole("button", { name: "Skills", exact: true }).click()
  await expect(page).toHaveURL(/\/panels\/Knowledge\/skills$/)
  await expect(panel.getByRole("heading", { name: "Proposed skill drafts awaiting review (2)" })).toBeVisible()
  await expect(panel.getByRole("heading", { name: "/weekly-brief", exact: true })).toBeVisible()
  await expect(panel.getByText("Weekly summary", { exact: true }).first()).toBeVisible()
  await panel.getByText("Inspect skill instructions", { exact: true }).first().click()
  await expect(panel.getByText("Summarize the week.")).toBeVisible()

  const draftCards = panel.locator("article")
  await draftCards.filter({ hasText: "/weekly-brief" }).getByRole("button", { name: "Approve", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "skills.drafts.approve").length).toBe(1)
  expect(operations.find((op) => op.action === "skills.drafts.approve")).toEqual({
    action: "skills.drafts.approve",
    public_id: "draft-1",
  })
  // Approving inspects the freshly published skill.
  await expect(panel.getByText("Summarize the week.", { exact: true })).toBeVisible()

  await draftCards.filter({ hasText: "/team-review" }).getByRole("button", { name: "Approve", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "skills.drafts.approve").length).toBe(2)
  expect(operations.filter((op) => op.action === "skills.drafts.approve").at(-1)).toEqual({
    action: "skills.drafts.approve",
    public_id: "draft-2",
    workspace: "one",
  })
})

test("skill drafts can be dismissed and published skills show, push and remove", async ({ page }) => {
  const operations: Command[] = []
  let drafts = [
    {
      public_id: "draft-9",
      name: "stale-draft",
      scope: "agent",
      description: "Outdated idea",
      content: "Ignore me.",
      created_at: "2030-01-01T00:00:00Z",
      updated_at: "2030-01-01T00:00:00Z",
    },
  ]
  let published = [skillDocument("weekly-brief")]
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "skills")
      return { agent: published, workspace: [], project: [], collections: {} }
    if (op.action === "skills.drafts") return { skill_drafts: drafts }
    if (op.action === "skills.drafts.dismiss") {
      drafts = []
      return { dismissed: { public_id: op.public_id } }
    }
    if (op.action === "skill.show") return published.find((row) => row.name === op.name) ?? null
    if (op.action === "skill.push") {
      published = [skillDocument(String(op.name), { content: op.content, description: op.description, lock_version: 3 })]
      return published[0]
    }
    if (op.action === "skill.remove") {
      published = []
      return { deleted: "skills/weekly-brief" }
    }
    return {}
  })
  await page.getByRole("button", { name: "Knowledge", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Knowledge", exact: true })
  await panel.getByRole("button", { name: "Skills", exact: true }).click()

  await panel.getByRole("button", { name: "Dismiss", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "skills.drafts.dismiss").length).toBe(1)
  expect(operations.find((op) => op.action === "skills.drafts.dismiss")).toEqual({
    action: "skills.drafts.dismiss",
    public_id: "draft-9",
  })
  await expect(panel.getByText("Proposed skill drafts awaiting review")).toHaveCount(0)

  await panel.getByRole("button", { name: "/weekly-brief", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "skill.show").length).toBe(1)
  expect(operations.find((op) => op.action === "skill.show")).toEqual({
    action: "skill.show",
    scope: "agent",
    name: "weekly-brief",
  })
  await expect(panel.getByText("Run the weekly rollup.")).toBeVisible()

  await panel.getByRole("button", { name: "Edit", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Author or update skill", exact: true })
  await expect(dialog.getByRole("textbox", { name: "Skill slug", exact: true })).toHaveValue("weekly-brief")
  await expect(dialog.getByRole("combobox", { name: "Scope", exact: true })).toBeDisabled()
  await dialog.getByRole("textbox", { name: "Markdown instructions", exact: true }).fill("Run the monthly rollup.")
  await dialog.getByRole("button", { name: "Publish skill", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => operations.filter((op) => op.action === "skill.push").length).toBe(1)
  expect(operations.find((op) => op.action === "skill.push")).toEqual({
    action: "skill.push",
    scope: "agent",
    name: "weekly-brief",
    description: "Weekly summary",
    content: "Run the monthly rollup.",
  })
  await expect(panel.getByText("Run the monthly rollup.")).toBeVisible()

  await panel.getByRole("button", { name: "Remove", exact: true }).click()
  await panel.getByRole("button", { name: "Confirm remove", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "skill.remove").length).toBe(1)
  expect(operations.find((op) => op.action === "skill.remove")).toEqual({
    action: "skill.remove",
    scope: "agent",
    name: "weekly-brief",
  })
  await expect(panel.getByText("No published skills yet.")).toBeVisible()
})

test("the knowledge panel points at Settings for the Personal Soul", async ({ page }) => {
  await fixture(page, (input) => {
    if (input.action === "memory.collections") return { items: [] }
    return {}
  })
  await page.getByRole("button", { name: "Knowledge", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Knowledge", exact: true })
  await expect(panel.getByRole("heading", { name: "Personal Soul", exact: true })).toBeVisible()
  await expect(panel.getByText(/edited in Settings under Persona/)).toBeVisible()
  await expect(panel.getByRole("combobox", { name: "Collection", exact: true })).toHaveValue("")
  await expect(panel.getByRole("button", { name: "New page", exact: true })).toBeDisabled()
})

test("channel tabs are addressable and restore from the page item", async ({ page }) => {
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    if (op.action === "channels")
      return {
        channels: {
          sources: [channelSource()],
          event_rules: [],
          attention_policy: {},
          observations: [],
          desks: {},
          active_adapters: [],
          outbox_messages: [],
        },
      }
    if (op.action === "bot.list") return []
    return {}
  })
  await page.getByRole("button", { name: "Channels", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Channels", exact: true })
  await panel.getByRole("button", { name: "Telegram", exact: true }).click()
  await expect(page).toHaveURL(/\/panels\/Channels\/telegram$/)
  await panel.getByRole("button", { name: "Peers", exact: true }).click()
  await expect(page).toHaveURL(/\/panels\/Channels\/peers$/)
  await expect(panel.getByRole("heading", { name: "Scoped peers" })).toBeVisible()

  await page.reload()
  const restored = page.getByRole("dialog", { name: "Channels", exact: true })
  await expect(restored.getByRole("heading", { name: "Scoped peers" })).toBeVisible()
  await expect(restored.getByRole("button", { name: "Peers", exact: true })).toHaveAttribute("aria-pressed", "true")
})
