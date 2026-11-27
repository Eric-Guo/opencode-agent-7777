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
          json: { items: [{ public_id: "one", name: "First workspace", dedicated: true }] },
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

function inboxItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    public_id: id,
    workspace_public_id: "one",
    title: "Task " + id,
    is_personal_desk: false,
    has_automation: false,
    reason: "ready",
    last_activity_at: "2030-01-01T00:00:00Z",
    ...overrides,
  }
}

function inboxPayload(
  sections: { needs_you?: unknown[]; running?: unknown[]; snoozed?: unknown[]; done?: unknown[] },
  skillDrafts = 0,
) {
  const full = { needs_you: [], running: [], snoozed: [], done: [], ...sections }

  return {
    inbox: {
      personal_desk: null,
      sections: full,
      counts: {
        needs_you: full.needs_you.length,
        running: full.running.length,
        snoozed: full.snoozed.length,
        done: full.done.length,
        skill_drafts: skillDrafts,
      },
    },
  }
}

function timeRoutine(overrides: Record<string, unknown> = {}) {
  return {
    kind: "time",
    public_id: "time-1",
    conversation_public_id: "desk",
    name: "Morning invoice check",
    what: "Check overnight invoices and flag anomalies",
    starts: { kind: "daily", run_at: null, every_seconds: null, starts_at: null, local_time: "09:00", time_zone: "UTC" },
    does: "check_in",
    wake: "passive",
    status: "active",
    enabled: true,
    lock_version: 3,
    next_run_at: "2030-01-02T09:00:00Z",
    ...overrides,
  }
}

function eventRoutine(overrides: Record<string, unknown> = {}) {
  return {
    kind: "event",
    public_id: "event-1",
    name: "GitHub invoice watch",
    what: "Triage matching invoices",
    starts: { type: "event", source_key: "webhook:github", pattern: "invoice" },
    does: "act",
    accept_mode: "observe",
    status: "observe",
    enabled: true,
    updated_at: "2030-01-01T00:00:00Z",
    ...overrides,
  }
}

function routinesPayload(
  routines: unknown[],
  attention_policy: unknown = { quiet_hours: { enabled: false, start: "23:00", end: "08:00", time_zone: "UTC" }, daily_proactive_limit: 6 },
  observations: unknown[] = [],
) {
  return {
    routines,
    time_routines: routines.filter((row) => (row as Command).kind === "time"),
    event_routines: routines.filter((row) => (row as Command).kind === "event"),
    attention_policy,
    observations,
  }
}

test("inbox tabs show counts, selection follows the queue and a wake refreshes the snoozed list", async ({ page }) => {
  const operations: Command[] = []
  let woken = false
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "inbox")
      return inboxPayload(
        {
          needs_you: [inboxItem("alpha", { reason: "awaiting_decision" }), inboxItem("beta", { reason: "execution_failed" })],
          running: [inboxItem("gamma", { reason: "working" })],
          snoozed: woken ? [] : [inboxItem("later", { snoozed_until: "2030-01-02T09:00:00Z" })],
        },
        2,
      )
    if (op.action === "inbox.snooze") {
      woken = true
      return {}
    }
    return {}
  })
  await page.getByRole("button", { name: "Inbox", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Inbox", exact: true })
  const detail = panel.locator(".nexus-inbox-heading strong")

  await expect(panel.getByRole("button", { name: "Needs you (2)", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(panel.getByRole("button", { name: "All (4)", exact: true })).toBeVisible()
  await expect(panel.getByText("2 proposed skills drafted by the agent", { exact: false })).toBeVisible()
  await expect(panel.locator(".nexus-inbox-row")).toHaveCount(2)
  await expect(detail).toHaveText("Task alpha")
  await expect(panel.locator(".nexus-inbox-selected")).toContainText("Task alpha")

  await panel.locator(".nexus-inbox-row").filter({ hasText: "Task beta" }).click()
  await expect(detail).toHaveText("Task beta")
  await expect(panel.getByText("Execution failed · ID beta", { exact: false })).toBeVisible()

  await panel.getByRole("button", { name: "Snoozed (1)", exact: true }).click()
  await expect(panel.locator(".nexus-inbox-row")).toHaveCount(1)
  await expect(detail).toHaveText("Task later")
  await expect(panel.locator(".nexus-inbox-row").getByText(/Snoozed ·/)).toBeVisible()
  await expect(panel.getByRole("button", { name: "Snooze", exact: true })).toHaveCount(0)
  await panel.getByRole("button", { name: "Wake now", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "inbox.snooze").length).toBe(1)
  expect(operations.find((op) => op.action === "inbox.snooze")).toEqual({
    action: "inbox.snooze",
    conversation: "later",
    until_at: null,
  })
  await expect(panel.getByRole("button", { name: "Snoozed (0)", exact: true })).toBeVisible()
  await expect(panel.getByText("No items in this view.")).toBeVisible()
})

test("an empty needs-you queue lands on the all tab once", async ({ page }) => {
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    if (op.action === "inbox") return inboxPayload({ running: [inboxItem("gamma", { reason: "automation_enabled" })] })
    return {}
  })
  await page.getByRole("button", { name: "Inbox", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Inbox", exact: true })
  await expect(panel.getByRole("button", { name: "All (1)", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(panel.locator(".nexus-inbox-heading strong")).toHaveText("Task gamma")
  await expect(panel.getByText("Standing routine · ID gamma", { exact: false })).toBeVisible()
})

test("snooze presets post the computed until_at and mark done archives the task", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2030-06-01T10:00:00.000Z"))
  const operations: Command[] = []
  let completed = false
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "inbox")
      return completed
        ? inboxPayload({ done: [inboxItem("alpha", { section: "done" })] })
        : inboxPayload({ needs_you: [inboxItem("alpha")] })
    if (op.action === "inbox.done") {
      completed = true
      return {}
    }
    return {}
  })
  await page.getByRole("button", { name: "Inbox", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Inbox", exact: true })

  await panel.getByRole("button", { name: "Snooze", exact: true }).click()
  await panel.getByRole("button", { name: "In 1 hour", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "inbox.snooze").length).toBe(1)
  expect(operations.at(-1)).toEqual({ action: "inbox.snooze", conversation: "alpha", until_at: "2030-06-01T11:00:00.000Z" })

  await panel.getByRole("button", { name: "Snooze", exact: true }).click()
  await panel.getByRole("button", { name: "Tomorrow 09:00", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "inbox.snooze").length).toBe(2)
  const tomorrow = new Date("2030-06-01T10:00:00.000Z")
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  expect(operations.at(-1)).toEqual({ action: "inbox.snooze", conversation: "alpha", until_at: tomorrow.toISOString() })

  await panel.getByRole("button", { name: "Snooze", exact: true }).click()
  await panel.getByRole("button", { name: "Someday (indefinite)", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "inbox.snooze").length).toBe(3)
  expect(operations.at(-1)).toEqual({ action: "inbox.snooze", conversation: "alpha", until_at: "indefinite" })

  await panel.getByRole("button", { name: "Mark done", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "inbox.done").length).toBe(1)
  expect(operations.find((op) => op.action === "inbox.done")).toEqual({ action: "inbox.done", conversation: "alpha" })
  await expect(panel.getByRole("button", { name: "Needs you (0)", exact: true })).toBeVisible()
  await panel.getByRole("button", { name: "Done (1)", exact: true }).click()
  await expect(panel.locator(".nexus-inbox-heading strong")).toHaveText("Task alpha")
  await expect(panel.getByRole("button", { name: "Mark done", exact: true })).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "Snooze", exact: true })).toHaveCount(0)
})

test("open full thread marks the item read and navigates to the conversation", async ({ page }) => {
  const operations: Command[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "inbox") return inboxPayload({ needs_you: [inboxItem("alpha")] })
    return {}
  })
  await page.getByRole("button", { name: "Inbox", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Inbox", exact: true })
  await panel.getByRole("button", { name: "Open full thread", exact: true }).click()
  await expect(page).toHaveURL(/#\/workspaces\/one\/conversations\/alpha$/)
  await expect.poll(() => operations.filter((op) => op.action === "inbox.read").length).toBe(1)
  expect(operations.find((op) => op.action === "inbox.read")).toEqual({
    action: "inbox.read",
    conversation: "alpha",
    activity_at: "2030-01-01T00:00:00Z",
  })
})

test("quick reply seals a prepared input, clears the draft and refreshes the queue", async ({ page }) => {
  const operations: Command[] = []
  const sends: { path: string; body: Command }[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "inbox") return inboxPayload({ needs_you: [inboxItem("alpha")] })
    return {}
  })
  await page.route("**/api/7777/chats/alpha/prepare", async (route) => {
    sends.push({ path: "prepare", body: route.request().postDataJSON() as Command })
    return route.fulfill({ json: { ticket: "ticket-1" } })
  })
  await page.route("**/api/7777/chats/alpha/inputs", async (route) => {
    sends.push({ path: "inputs", body: route.request().postDataJSON() as Command })
    return route.fulfill({ status: 202, json: { id: "input-1" } })
  })
  await page.getByRole("button", { name: "Inbox", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Inbox", exact: true })
  const reply = panel.getByRole("textbox", { name: "Reply to Task alpha", exact: true })
  const reads = () => operations.filter((op) => op.action === "inbox").length
  await expect.poll(reads).toBe(1)

  await reply.fill("Ship the report")
  await panel.getByRole("button", { name: "Send", exact: true }).click()
  await expect.poll(() => sends.length).toBe(2)
  expect(sends[0].path).toBe("prepare")
  expect(sends[0].body).toMatchObject({ text: "Ship the report", model: null, delivery: "queue" })
  expect(String(sends[0].body.key)).not.toBe("")
  expect(sends[1]).toEqual({ path: "inputs", body: { ...sends[0].body, ticket: "ticket-1" } })
  await expect(reply).toHaveValue("")
  await expect.poll(reads).toBe(2)
})

test("the detail deck previews turns and answers a held approval inline", async ({ page }) => {
  const decisions: Command[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    if (op.action === "inbox") return inboxPayload({ needs_you: [inboxItem("alpha", { reason: "awaiting_decision" })] })
    return {}
  })
  await page.route("**/api/7777/chats/alpha", async (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    return route.fulfill({
      json: {
        turns: [
          {
            id: "t1",
            input: null,
            variant: "v1",
            run: null,
            position: 1,
            created: 1,
            prompt: "Check the deploy",
            text: "",
            status: "completed",
          },
          {
            id: "t2",
            input: null,
            variant: "v2",
            run: "run-1",
            position: 2,
            created: 2,
            prompt: null,
            text: "Deploy is waiting on approval",
            status: "held",
          },
        ],
        pending: [],
        busy: true,
        problem: null,
        decisions: [
          {
            run: "run-1",
            key: "task-1",
            kind: "approval",
            tool: "bash",
            prompt: "Run the deploy?",
            options: null,
            multi: false,
            fields: [],
            tool_input: { command: "make deploy" },
          },
        ],
        detail: { title: "Task alpha", runner: "runner", archived: false, owned: false, active: null, version: 3 },
      },
    })
  })
  await page.route("**/api/7777/chats/alpha/decisions", async (route) => {
    decisions.push(route.request().postDataJSON() as Command)
    return route.fulfill({ json: {} })
  })
  await page.getByRole("button", { name: "Inbox", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Inbox", exact: true })

  await expect(panel.getByText("Check the deploy", { exact: true })).toBeVisible()
  await expect(panel.getByText("Deploy is waiting on approval", { exact: true })).toBeVisible()
  await expect(panel.getByText("OpenCode · held", { exact: true })).toBeVisible()
  await expect(panel.getByRole("group", { name: "Run the deploy?", exact: true })).toBeVisible()
  await panel.getByRole("button", { name: "Allow once", exact: true }).click()
  await expect.poll(() => decisions.length).toBe(1)
  expect(decisions[0]).toEqual({ run: "run-1", key: "task-1", response: { action: "approve" } })
})

test("keyboard shortcuts move selection, mark done and open the thread", async ({ page }) => {
  const operations: Command[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "inbox") return inboxPayload({ needs_you: [inboxItem("alpha"), inboxItem("beta")] })
    return {}
  })
  await page.getByRole("button", { name: "Inbox", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Inbox", exact: true })
  const detail = panel.locator(".nexus-inbox-heading strong")

  await expect(detail).toHaveText("Task alpha")
  await page.keyboard.press("j")
  await expect(detail).toHaveText("Task beta")
  await page.keyboard.press("k")
  await expect(detail).toHaveText("Task alpha")
  await page.keyboard.press("ArrowDown")
  await expect(detail).toHaveText("Task beta")
  await page.keyboard.press("ArrowUp")
  await expect(detail).toHaveText("Task alpha")
  await page.keyboard.press("e")
  await expect.poll(() => operations.filter((op) => op.action === "inbox.done").length).toBe(1)
  expect(operations.find((op) => op.action === "inbox.done")).toEqual({ action: "inbox.done", conversation: "alpha" })

  // A focused button owns Enter; click neutral chrome before opening with the keyboard.
  await panel.locator(".nexus-inbox-transcript").click()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/#\/workspaces\/one\/conversations\/alpha$/)
})

test("routine cards list both kinds with counts, filters and next runs", async ({ page }) => {
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    if (op.action === "routines") return routinesPayload([timeRoutine(), eventRoutine()])
    return {}
  })
  await page.getByRole("button", { name: "Routines", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Routines", exact: true })

  await expect(panel.getByText("2 active · 1 silent check-in", { exact: false })).toBeVisible()
  const cards = panel.locator(".nexus-card")
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toContainText("Morning invoice check")
  await expect(cards.nth(0)).toContainText("Daily at 09:00 (UTC)")
  await expect(cards.nth(0)).toContainText("Silent check-in")
  await expect(cards.nth(0)).toContainText("active")
  await expect(cards.nth(0)).toContainText("Next: " + new Date("2030-01-02T09:00:00Z").toLocaleString())
  await expect(cards.nth(1)).toContainText("GitHub invoice watch")
  await expect(cards.nth(1)).toContainText('Event on webhook:github matching "invoice"')
  await expect(cards.nth(1)).toContainText("Act & report")
  await expect(cards.nth(1)).toContainText("Triggered by channel gate")

  await panel.getByRole("button", { name: "Event-triggered", exact: true }).click()
  await expect(panel.locator(".nexus-card")).toHaveCount(1)
  await expect(panel.locator(".nexus-card")).toContainText("GitHub invoice watch")
  await panel.getByRole("button", { name: "Silent check-ins", exact: true }).click()
  await expect(panel.locator(".nexus-card")).toHaveCount(1)
  await expect(panel.locator(".nexus-card")).toContainText("Morning invoice check")
  await panel.getByRole("button", { name: "Scheduled", exact: true }).click()
  await expect(panel.locator(".nexus-card")).toHaveCount(1)
  await expect(panel.locator(".nexus-card")).toContainText("Morning invoice check")
})

test("a time routine's thread link opens its conversation", async ({ page }) => {
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    if (op.action === "routines") return routinesPayload([timeRoutine(), eventRoutine()])
    return {}
  })
  await page.getByRole("button", { name: "Routines", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Routines", exact: true })
  const cards = panel.locator(".nexus-card")
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(1).getByRole("button", { name: "Thread", exact: true })).toHaveCount(0)
  await cards.nth(0).getByRole("button", { name: "Thread", exact: true }).click()
  await expect(page).toHaveURL(/#\/workspaces\/one\/conversations\/desk$/)
})

test("the skill-draft callout opens the Knowledge skills tab", async ({ page }) => {
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    if (op.action === "inbox") return inboxPayload({ needs_you: [inboxItem("alpha")] }, 2)
    if (op.action === "skills")
      return { agent: [], workspace: [], project: [], collections: {} }
    if (op.action === "skills.drafts") return { skill_drafts: [] }
    return {}
  })
  await page.getByRole("button", { name: "Inbox", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Inbox", exact: true })
  await panel.getByRole("button", { name: "Review proposals", exact: true }).click()
  await expect(page).toHaveURL(/\/panels\/Knowledge\/skills$/)
  const knowledge = page.getByRole("dialog", { name: "Knowledge", exact: true })
  await expect(knowledge.getByRole("button", { name: "Skills", exact: true })).toHaveAttribute("aria-pressed", "true")
})

test("creating time routines retries with a stable key and posts daily and interval rules", async ({ page }) => {
  const writes: Command[] = []
  await fixture(page, (input) => {
    if (input.action === "routine.create") {
      writes.push(input)
      if (writes.length === 1) return new Error("Retry this routine")
      return {}
    }
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    if (op.action === "routines") return routinesPayload([])
    return {}
  })
  await page.getByRole("button", { name: "Routines", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Routines", exact: true })
  await panel.getByRole("button", { name: "New routine", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "New routine", exact: true })

  await dialog.getByRole("textbox", { name: "Routine name", exact: true }).fill("Morning check")
  await dialog.getByRole("textbox", { name: "What should the agent do?", exact: true }).fill("Check invoices")
  await dialog.getByRole("button", { name: "Save routine", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Retry this routine")
  await expect(dialog.getByRole("textbox", { name: "Routine name", exact: true })).toHaveValue("Morning check")
  await dialog.getByRole("button", { name: "Save routine", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1]).toEqual(writes[0])
  expect(writes[0]).toEqual({
    action: "routine.create",
    what: "Check invoices",
    does: "check_in",
    name: "Morning check",
    rule: { kind: "daily", local_time: "09:00", time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
    key: expect.any(String),
  })

  await panel.getByRole("button", { name: "New routine", exact: true }).click()
  await dialog.getByRole("textbox", { name: "What should the agent do?", exact: true }).fill("Poll the queue")
  await dialog.getByRole("combobox", { name: "Attention behavior", exact: true }).selectOption("act")
  await dialog.getByRole("combobox", { name: "Cadence", exact: true }).selectOption("interval")
  await dialog.getByRole("spinbutton", { name: "Every (seconds)", exact: true }).fill("7200")
  await dialog.getByLabel("First run", { exact: true }).fill("2030-06-01T12:00")
  await dialog.getByRole("button", { name: "Save routine", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => writes.length).toBe(3)
  expect(writes[2]).toEqual({
    action: "routine.create",
    what: "Poll the queue",
    does: "act",
    name: undefined,
    rule: { kind: "interval", every_seconds: 7200, starts_at: new Date("2030-06-01T12:00").toISOString() },
    key: expect.any(String),
  })
  expect(writes[2].key).not.toBe(writes[0].key)
})

test("creating an event routine validates the source key and posts routines.create", async ({ page }) => {
  const operations: Command[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "routines") return routinesPayload([])
    return {}
  })
  await page.getByRole("button", { name: "Routines", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Routines", exact: true })
  await panel.getByRole("button", { name: "New routine", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "New routine", exact: true })

  await dialog.getByRole("combobox", { name: "Trigger", exact: true }).selectOption("event")
  await dialog.getByRole("textbox", { name: "Routine name", exact: true }).fill("Invoice watch")
  await dialog.getByRole("textbox", { name: "What should the agent do?", exact: true }).fill("Triage invoices")
  await dialog.getByRole("combobox", { name: "Attention behavior", exact: true }).selectOption("act")
  await dialog.getByRole("textbox", { name: "Source key", exact: true }).fill("Webhook BAD")
  await dialog.getByRole("button", { name: "Save routine", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Source key must be * or match")
  expect(operations.filter((op) => op.action === "routines.create")).toHaveLength(0)

  await dialog.getByRole("textbox", { name: "Source key", exact: true }).fill("webhook:github")
  await dialog.getByRole("textbox", { name: "Keyword / text filter (optional)", exact: true }).fill("invoice")
  await dialog.getByRole("button", { name: "Save routine", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => operations.filter((op) => op.action === "routines.create").length).toBe(1)
  expect(operations.find((op) => op.action === "routines.create")).toEqual({
    action: "routines.create",
    kind: "event",
    name: "Invoice watch",
    source_key: "webhook:github",
    instructions: "Triage invoices",
    pattern: "invoice",
    does: "act",
  })
})

test("toggling and removing routines posts scoped operations and refreshes the cards", async ({ page }) => {
  const operations: Command[] = []
  let routines: Record<string, unknown>[] = [timeRoutine(), eventRoutine()]
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "routines") return routinesPayload(routines)
    if (op.action === "routines.toggle") {
      routines = routines.map((row) =>
        row.public_id === op.public_id ? { ...row, enabled: op.enabled, status: op.enabled ? "active" : "paused" } : row,
      )
      return {}
    }
    if (op.action === "routines.rm") {
      routines = routines.filter((row) => row.public_id !== op.public_id)
      return {}
    }
    return {}
  })
  await page.getByRole("button", { name: "Routines", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Routines", exact: true })
  const time = panel.locator(".nexus-card").filter({ hasText: "Morning invoice check" })
  const event = panel.locator(".nexus-card").filter({ hasText: "GitHub invoice watch" })

  await time.getByRole("button", { name: "Pause", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "routines.toggle").length).toBe(1)
  expect(operations.find((op) => op.action === "routines.toggle")).toEqual({
    action: "routines.toggle",
    kind: "time",
    public_id: "time-1",
    conversation: "desk",
    enabled: false,
  })
  await expect(time.getByRole("button", { name: "Resume", exact: true })).toBeVisible()
  await expect(time).toContainText("paused")

  await event.getByRole("button", { name: "Remove", exact: true }).click()
  await event.getByRole("button", { name: "Confirm remove", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "routines.rm").length).toBe(1)
  expect(operations.find((op) => op.action === "routines.rm")).toEqual({
    action: "routines.rm",
    kind: "event",
    public_id: "event-1",
  })
  await expect(panel.locator(".nexus-card").filter({ hasText: "GitHub invoice watch" })).toHaveCount(0)
})

test("event routines edit name, instructions, pattern and behavior", async ({ page }) => {
  const operations: Command[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "routines") return routinesPayload([eventRoutine()])
    if (op.action === "routines.update") return {}
    return {}
  })
  await page.getByRole("button", { name: "Routines", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Routines", exact: true })
  await panel.locator(".nexus-card").getByRole("button", { name: "Edit", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Edit event routine", exact: true })

  await expect(dialog.getByRole("textbox", { name: "Routine name", exact: true })).toHaveValue("GitHub invoice watch")
  await expect(dialog.getByRole("textbox", { name: "Keyword / text filter (optional)", exact: true })).toHaveValue(
    "invoice",
  )
  await dialog.getByRole("textbox", { name: "Routine name", exact: true }).fill("GitHub payment watch")
  await dialog.getByRole("textbox", { name: "Instructions", exact: true }).fill("Triage matching payments")
  await dialog.getByRole("textbox", { name: "Keyword / text filter (optional)", exact: true }).fill("payment")
  await dialog.getByRole("combobox", { name: "Attention behavior", exact: true }).selectOption("check_in")
  await dialog.getByRole("button", { name: "Save routine", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => operations.filter((op) => op.action === "routines.update").length).toBe(1)
  expect(operations.find((op) => op.action === "routines.update")).toEqual({
    action: "routines.update",
    kind: "event",
    public_id: "event-1",
    name: "GitHub payment watch",
    instructions: "Triage matching payments",
    pattern: "payment",
    does: "check_in",
  })
})

test("a stale time-routine edit surfaces the conflict and keeps the draft", async ({ page }) => {
  const operations: Command[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "routines") return routinesPayload([timeRoutine()])
    return {}
  })
  await page.route("**/api/7777/manage", async (route) => {
    const input = route.request().postDataJSON() as Command
    const op = input.operation as Command | undefined
    if (input.action !== "application.operation" || op?.action !== "routines.update") return route.fallback()
    operations.push(op)
    return route.fulfill({
      status: 409,
      json: { error: "This routine changed since you opened it. Refresh to review the saved routine." },
    })
  })
  await page.getByRole("button", { name: "Routines", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Routines", exact: true })
  await panel.locator(".nexus-card").getByRole("button", { name: "Edit", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Edit scheduled routine", exact: true })

  await expect(dialog.getByRole("textbox", { name: "Routine name", exact: true })).toHaveValue("Morning invoice check")
  await expect(dialog.getByRole("textbox", { name: "Prompt", exact: true })).toHaveValue(
    "Check overnight invoices and flag anomalies",
  )
  await dialog.getByRole("textbox", { name: "Routine name", exact: true }).fill("Evening invoice check")
  await dialog.getByRole("textbox", { name: "Prompt", exact: true }).fill("Check evening invoices")
  await dialog.getByRole("button", { name: "Save routine", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("This routine changed since you opened it.")
  await expect(dialog.getByRole("textbox", { name: "Routine name", exact: true })).toHaveValue("Evening invoice check")
  await expect(dialog.getByRole("textbox", { name: "Prompt", exact: true })).toHaveValue("Check evening invoices")
  expect(operations.find((op) => op.action === "routines.update")).toEqual({
    action: "routines.update",
    kind: "time",
    public_id: "time-1",
    conversation: "desk",
    expected_lock_version: 3,
    name: "Evening invoice check",
    prompt: "Check evening invoices",
    does: "check_in",
  })
})

test("attention policy saves quiet hours and clamps the daily cap", async ({ page }) => {
  const operations: Command[] = []
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    operations.push(op)
    if (op.action === "routines")
      return routinesPayload(
        [],
        { quiet_hours: { enabled: true, start: "22:00", end: "08:00", time_zone: "UTC" }, daily_proactive_limit: 5 },
        [],
      )
    if (op.action === "channels.attention") return {}
    return {}
  })
  await page.getByRole("button", { name: "Routines", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Routines", exact: true })

  await panel.getByRole("button", { name: "Quiet 22:00–08:00 · Cap 5/day", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Attention & quiet hours", exact: true })
  await expect(dialog.getByRole("checkbox", { name: "Enable quiet hours", exact: true })).toBeChecked()
  await expect(dialog.getByLabel("Start", { exact: true })).toHaveValue("22:00")
  await expect(dialog.getByLabel("End", { exact: true })).toHaveValue("08:00")
  await expect(dialog.getByRole("textbox", { name: "Time zone", exact: true })).toHaveValue("UTC")
  await dialog.getByRole("spinbutton", { name: "Daily proactive outreach cap", exact: true }).fill("250")
  await dialog.getByRole("button", { name: "Save policy", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => operations.filter((op) => op.action === "channels.attention").length).toBe(1)
  expect(operations.find((op) => op.action === "channels.attention")).toEqual({
    action: "channels.attention",
    quiet_hours: { enabled: true, start: "22:00", end: "08:00", time_zone: "UTC" },
    daily_proactive_limit: 100,
  })

  await panel.getByRole("button", { name: /Cap 5\/day/ }).click()
  await dialog.getByRole("spinbutton", { name: "Daily proactive outreach cap", exact: true }).fill("0")
  await dialog.getByRole("button", { name: "Save policy", exact: true }).click()
  await expect.poll(() => operations.filter((op) => op.action === "channels.attention").length).toBe(2)
  expect(operations.filter((op) => op.action === "channels.attention").at(-1)).toMatchObject({
    daily_proactive_limit: 6,
  })
})

test("observed events list gate decisions with rules, preview and time", async ({ page }) => {
  await fixture(page, (input) => {
    if (input.action !== "application.operation") return {}
    const op = input.operation as Command
    if (op.action === "routines")
      return routinesPayload([], undefined, [
        {
          public_id: "obs-1",
          source_key: "webhook:github",
          decision: "would_accept",
          matched_rules: ["invoice-watch"],
          preview: "Invoice #2026-11 arrived",
          observed_at: "2030-01-01T00:00:00Z",
        },
      ])
    return {}
  })
  await page.getByRole("button", { name: "Routines", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Routines", exact: true })
  await panel.getByRole("button", { name: "1 observed", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Observed channel events", exact: true })
  await expect(dialog.getByText("webhook:github", { exact: true })).toBeVisible()
  await expect(dialog.getByText("would_accept", { exact: true })).toBeVisible()
  await expect(dialog.getByText("Matched rules: invoice-watch", { exact: true })).toBeVisible()
  await expect(dialog.getByText("Invoice #2026-11 arrived", { exact: true })).toBeVisible()
  await expect(dialog.getByText(new Date("2030-01-01T00:00:00Z").toLocaleString(), { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).not.toBeVisible()
})