import { expect, test, type Page } from "@playwright/test"

type Command = { action: string; [key: string]: unknown }

async function fixture(
  page: Page,
  command: (input: Command) => unknown | Promise<unknown>,
  address = "/component-tests/nexus-chat.html",
  workspace = "one",
) {
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

    if (url.pathname.endsWith("/manage")) {
      const input = route.request().postDataJSON() as Command

      if (input.action === "workspace.list")
        return route.fulfill({
          json: {
            items: [
              { public_id: "one", name: "First workspace", dedicated: true },
              { public_id: "two", name: "Shared workspace", dedicated: false },
            ],
          },
        })

      return route.fulfill({ json: await command(input) })
    }

    return route.fulfill({ json: {} })
  })
  await page.goto(address)
  await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue(workspace)
}

test("switches workspaces and retains plugin secrets until explicitly changed", async ({ page }) => {
  const writes: Command[] = []

  const extension = {
    id: "fixture",
    name: "Fixture plugin",
    description: "Test fields",
    enabled: true,
    active: true,
    ready: true,
    restart_required: false,
    configuration_version: 1,
    diagnostics: [],
    tools: [],
    configuration: { count: 2, payload: { old: true } },
    configuration_schema: {
      type: "object",
      properties: {
        token: { type: "string", writeOnly: true },
        count: { type: "integer" },
        payload: { type: "object" },
      },
    },
  }

  await fixture(page, (input) => {
    if (input.action === "extension.list") return [extension]

    if (input.action === "extension.call") return { packages: [] }
    writes.push(input)

    return { saved: true, applied: true }
  })
  await page.getByRole("combobox", { name: "Workspace", exact: true }).selectOption("two")
  await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue("two")
  await page.getByRole("button", { name: "Plugins", exact: true }).click()
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("spinbutton", { name: "count", exact: true }).fill("3")
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("spinbutton", { name: "count", exact: true })).toHaveValue("3")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({
    action: "extension.configure",
    change: { id: "fixture", operations: [{ op: "set", path: ["count"], value: 3 }] },
  })
  await page.getByRole("textbox", { name: "token", exact: true }).fill("replacement")
  await page.getByRole("button", { name: "Discard", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "token", exact: true })).toHaveValue("")
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("button", { name: "Back to conversation" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole("combobox", { name: "Workspace", exact: true }).selectOption("one")
  await expect(page.getByRole("dialog", { name: "Plugins", exact: true })).toHaveCount(0)
})

test("rejects invalid configuration JSON and distinguishes inherited fallback from an empty list", async ({ page }) => {
  const writes: Command[] = []
  await fixture(page, (input) => {
    if (input.action === "extension.list") return []

    if (input.action === "preset.list")
      return { presets: [], main_preset_public_id: "", default_bot_preset_public_id: "" }
    writes.push(input)

    return {
      public_id: "saved",
      name: "Fixture",
      description: "Test",
      configuration: (input.value as { configuration: unknown }).configuration,
      role: null,
    }
  })
  await page.getByRole("button", { name: "Presets", exact: true }).click()
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Fixture")
  await page.getByRole("textbox", { name: "Description", exact: true }).fill("Test")
  await page.getByRole("combobox", { name: "Fallback policy", exact: true }).selectOption("none")
  const advanced = page.getByRole("textbox", { name: "Advanced configuration, including MCP selections" })
  await expect(advanced).toHaveValue(/"fallback_models": \[\]/)
  await advanced.fill("{")
  await page.getByRole("button", { name: "Save Preset", exact: true }).click()
  expect(writes).toEqual([])
  await advanced.fill('{"fallback_models":[]}')
  await page.getByRole("button", { name: "Save Preset", exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect((writes[0].value as { configuration: unknown }).configuration).toEqual({ fallback_models: [] })
  await page.getByRole("combobox", { name: "Fallback policy", exact: true }).selectOption("inherit")
  await page.getByRole("button", { name: "Save Preset", exact: true }).click()
  await expect.poll(() => writes.length).toBe(2)
  expect((writes[1].value as { configuration: unknown }).configuration).toEqual({ fallback_models: null })
})

test("loads extension modules with relative imports and replaces and disables their contributions", async ({
  page,
}) => {
  let enabled = true
  let version = "v1"
  await page.route("**/api/7777/modules/**", async (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: route.request().url().endsWith("label.js")
        ? `export const label = ${JSON.stringify("Module " + version + " ready")}`
        : `import { label } from './label.js'; export function register(ui) { ui.slots.register('settings.section', { id: 'fixture' }, () => { const element = document.createElement('p'); element.textContent = label; return { element }; }); }`,
    }),
  )
  await fixture(page, (input) => {
    if (input.action === "extension.list")
      return [
        {
          id: "fixture",
          name: "Fixture plugin",
          description: "Module test",
          active: enabled,
          enabled,
          ready: true,
          configuration_version: 1,
          configuration_schema: { type: "object", properties: {} },
          configuration: {},
          diagnostics: [],
          tools: [],
          restart_required: false,
          webui: { version, entry: "index.js" },
        },
      ]

    if (input.action === "extension.configure") {
      enabled = false

      return {}
    }

    if (input.action === "extension.call") return { packages: [] }

    if (input.action === "settings.read")
      return {
        default_model: null,
        fallback_models: [],
        kernel_tools: [],
        subagent_default: true,
        adaptations: "auto",
        adaptations_dir: null,
        conversation_title_model: null,
      }

    if (input.action === "persona.read") return { content: "" }

    return {}
  })
  await page.getByRole("button", { name: "Plugins", exact: true }).click()
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await page.getByRole("button", { name: "Back to conversation" }).click()
  await page.getByRole("button", { name: "Settings & account" }).click()
  await expect(page.getByText("Module v1 ready", { exact: true })).toBeVisible()
  version = "v2"
  await page.getByRole("button", { name: "Back to conversation" }).click()
  await page.getByRole("button", { name: "Plugins", exact: true }).click()
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await page.getByRole("button", { name: "Back to conversation" }).click()
  await page.getByRole("button", { name: "Settings & account" }).click()
  await expect(page.getByText("Module v2 ready", { exact: true })).toBeVisible()
  await expect(page.getByText("Module v1 ready", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Back to conversation" }).click()
  await page.getByRole("button", { name: "Plugins", exact: true }).click()
  await page.getByRole("checkbox", { name: "Enabled" }).uncheck()
  await page.getByRole("button", { name: "Back to conversation" }).click()
  await page.getByRole("button", { name: "Settings & account" }).click()
  await expect(page.getByText("Module v2 ready", { exact: true })).toHaveCount(0)
})

test("workspace, conversation and panel links survive reload and browser history while preserving the host URL", async ({
  page,
}) => {
  const connections: string[] = []
  const scheduleScopes: unknown[] = []
  page.on("request", (request) => {
    if (request.url().includes("/api/7777/connection")) connections.push(request.url())
  })
  await fixture(
    page,
    (input) => {
      if (input.action === "schedule.list") scheduleScopes.push(input.workspace)

      return input.action === "extension.list" ? [] : { items: [], next_after: null }
    },
    "/component-tests/nexus-chat.html?debug=retained#/workspaces/two/conversations/conversation",
    "two",
  )
  await expect(page.getByRole("heading", { name: "Navigation chat", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Schedules", exact: true }).click()
  await expect(page).toHaveURL(/\?debug=retained#\/workspaces\/two\/panels\/schedules$/)
  await page.reload()
  await expect(page.getByRole("dialog", { name: "Schedules", exact: true })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue("two")
  await page.goBack()
  await expect(page).toHaveURL(/#\/workspaces\/two\/conversations\/conversation$/)
  await expect(page.getByRole("dialog", { name: "Schedules", exact: true })).not.toBeVisible()
  await page.goForward()
  await expect(page.getByRole("dialog", { name: "Schedules", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Back to conversation" }).click()
  await page.getByRole("button", { name: "New session" }).click()
  await expect(page).toHaveURL(/#\/workspaces\/two$/)
  await page.goBack()
  await expect(page.getByRole("heading", { name: "Navigation chat", exact: true })).toBeVisible()
  const before = connections.length
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  })
  await expect.poll(() => connections.length).toBe(before + 1)
  expect(connections.at(-1)).toContain("workspace=two")
  await page.getByRole("button", { name: "Schedules", exact: true }).click()
  await page.evaluate(() => {
    history.pushState(null, "", "?debug=retained#/workspaces/one/panels/schedules")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue("one")
  await expect.poll(() => scheduleScopes.at(-1)).toBe("one")
  await expect(page.getByRole("dialog", { name: "Schedules", exact: true })).toBeVisible()
})

test("creating a workspace selects it without changing the runtime default", async ({ page }) => {
  const writes: Command[] = []
  await fixture(page, (input) => {
    if (input.action === "extension.list") return []
    writes.push(input)

    return { workspace: { public_id: "two" } }
  })
  await page.getByRole("button", { name: "Workspaces", exact: true }).click()
  await page.getByRole("textbox", { name: "New dedicated workspace" }).fill("New workspace")
  await page.getByRole("button", { name: "Create workspace", exact: true }).click()
  await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue("two")
  await expect(page).toHaveURL(/#\/workspaces\/two$/)
  expect(writes.map((row) => row.action)).toEqual(["workspace.create"])
})

test("schedules retain execution pages, expose their clock and model, and keep finished jobs read-only", async ({
  page,
}) => {
  const writes: Command[] = []

  const job = (id: string, status: string, next: string) => ({
    public_id: id,
    name: id,
    prompt: "Scheduled prompt",
    status,
    writable: id !== "Later",
    next_run_at: next,
    conversation_public_id: "conversation",
    lock_version: 2,
    rule: { kind: "interval", starts_at: next, every_seconds: 3600 },
    model: { model: "provider/model" },
    approval_mode: "ask",
  })

  const jobs = [
    job("Later", "active", "2030-01-02T00:00:00Z"),
    job("Earlier", "active", "2030-01-01T00:00:00Z"),
    job("Finished", "completed", "2030-01-01T00:00:00Z"),
  ]

  await fixture(page, (input) => {
    if (input.action === "extension.list") return []

    if (input.action === "schedule.list") return { items: jobs, next_after: null }

    if (input.action === "schedule.executions") {
      writes.push(input)

      return {
        items: [
          {
            child_conversation_public_id: input.after ? "second" : "first",
            scheduled_for: "2029-01-01T00:00:00Z",
            status: input.after ? "failed" : "completed",
          },
        ],
        next_after: input.after ? null : "page-two",
      }
    }

    writes.push(input)

    return {}
  })
  await page.getByRole("button", { name: "Schedules", exact: true }).click()
  const articles = page.locator(".nexus-management article")
  await expect(articles.nth(0)).toContainText("Earlier")
  await expect(articles.nth(1)).toContainText("Later")
  await expect(articles.nth(0)).toContainText("Every 3600 seconds")
  await expect(articles.nth(1)).toContainText("Read-only conversation")
  await expect(articles.nth(1).getByRole("button", { name: "Edit", exact: true })).toHaveCount(0)
  const finished = articles.filter({ has: page.getByText("Finished", { exact: true }) })
  await expect(finished.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0)
  await expect(finished.getByRole("button", { name: "Run now", exact: true })).toHaveCount(0)
  await finished.getByRole("button", { name: "Executions", exact: true }).click()
  await page.getByRole("button", { name: "Load more executions", exact: true }).click()
  await expect(page.getByRole("button", { name: "Open execution", exact: true })).toHaveCount(2)
  expect(writes.filter((row) => row.action === "schedule.executions").map((row) => row.after)).toEqual([
    undefined,
    "page-two",
  ])
  await articles.nth(0).getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveValue("provider/model")
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("Changed prompt")
  await page.getByRole("button", { name: "Save job", exact: true }).click()
  await expect.poll(() => writes.filter((row) => row.action === "schedule.update").length).toBe(1)
  expect(writes.find((row) => row.action === "schedule.update")).not.toHaveProperty("model")
})

test("an unconfirmed upgrade survives reload and retries only its checked payload and key", async ({ page }) => {
  const posts: Command[] = []
  let operation: Record<string, unknown> | null = null

  const deployment = () => ({
    supported: true,
    sources: [],
    installed: null,
    candidate: { release: "v2", images: [] },
    preflight: { ready: true, backup: true, checks: [] },
    active_operation: null,
    last_operation: operation,
  })

  await fixture(page, (input) => {
    if (input.action === "extension.list") return []

    if (input.action === "platform.request")
      return String(input.path).endsWith("/log")
        ? { log: { entries: [], next_cursor: null, operation } }
        : { deployment: deployment() }

    return {}
  })
  await page.route("**/api/7777/manage", async (route) => {
    const input = route.request().postDataJSON() as Command

    if (input.action !== "platform.request" || input.method !== "POST" || !String(input.path).endsWith("/upgrades"))
      return route.fallback()
    posts.push(input)

    if (posts.length === 1) return route.fulfill({ status: 503, json: { error: "Lost upgrade response" } })
    operation = {
      id: "upgrade",
      idempotency_key: input.key,
      target: { release: "v2" },
      status: "succeeded",
      phase: "complete",
      completed_at: "2030-01-01T00:00:00Z",
    }

    return route.fulfill({ json: { upgrade: operation } })
  })
  await page.getByRole("button", { name: "Updates", exact: true }).click()
  await page.getByRole("button", { name: "Check release and requirements", exact: true }).click()
  await page.getByText("Install checked release", { exact: true }).click()
  await page.getByRole("button", { name: "Confirm installation", exact: true }).click()
  await expect(page.getByRole("button", { name: "Retry checked installation", exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("button", { name: "Retry checked installation", exact: true })).toBeVisible()
  expect(posts).toHaveLength(1)
  await expect(page.getByRole("button", { name: "Check release and requirements", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Refresh deployment", exact: true }).click()
  expect(posts).toHaveLength(1)
  await page.getByRole("button", { name: "Retry checked installation", exact: true }).click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1]).toEqual(posts[0])
  await expect(page.getByRole("button", { name: "Retry checked installation", exact: true })).not.toBeVisible()
})

test("Bot and plugin item links restore the selected editor and New Bot restores its own defaults", async ({
  page,
}) => {
  const bot = {
    public_id: "existing",
    name: "bot-existing",
    display_name: "Existing Bot",
    description: "Saved Bot",
    current: null,
    settings: {
      audience: "owner",
      preset_public_id: "other",
      home_workspace_public_id: null,
      subagent: false,
      welcome_message: null,
    },
  }

  const plugin = {
    id: "fixture",
    name: "Fixture plugin",
    description: "Fields",
    enabled: true,
    active: true,
    ready: true,
    restart_required: false,
    configuration_version: 1,
    diagnostics: [],
    tools: [],
    configuration: { count: 2 },
    configuration_schema: { type: "object", properties: { count: { type: "integer" } } },
  }

  await fixture(
    page,
    (input) => {
      if (input.action === "extension.list") return [plugin]

      if (input.action === "extension.call") return { packages: [] }

      if (input.action === "bot.list") return [bot]

      if (input.action === "bot.history") return { items: [], next_after: null }

      if (input.action === "preset.list")
        return {
          presets: [
            { public_id: "default", name: "Default", description: "", configuration: {} },
            { public_id: "other", name: "Saved preset", description: "", configuration: {} },
          ],
          default_bot_preset_public_id: "default",
        }

      return {}
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/bots/existing",
  )
  await expect(page.getByRole("combobox", { name: "Preset", exact: true })).toHaveValue("other")
  await page.getByRole("button", { name: "History", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Conversation history", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "New Bot", exact: true }).click()
  await expect(page).toHaveURL(/\/panels\/bots\/new$/)
  await expect(page.getByRole("combobox", { name: "Preset", exact: true })).toHaveValue("default")
  await expect(page.getByRole("checkbox", { name: "Subagent", exact: true })).toBeChecked()
  await expect(page.getByRole("heading", { name: "Conversation history", exact: true })).not.toBeVisible()
  await page.goBack()
  await expect(page.getByRole("combobox", { name: "Preset", exact: true })).toHaveValue("other")
  await page.getByRole("button", { name: "Back to conversation", exact: true }).click()
  await page.getByRole("button", { name: "Plugins", exact: true }).click()
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(page).toHaveURL(/\/panels\/plugins\/fixture$/)
  await page.reload()
  await expect(page.getByRole("spinbutton", { name: "count", exact: true })).toHaveValue("2")
})

test("new chat mode controls follow runtime defaults and availability", async ({ page }) => {
  let enabled = false
  await fixture(page, (input) => (input.action === "extension.list" ? [] : {}))
  await page.route("**/api/7777/choices", (route) =>
    route.fulfill({
      json: {
        models: ["provider/model"],
        runners: [{ id: "runner", name: "Local" }],
        approvals: ["ask"],
        modes: { available: true, code_mode: enabled, subagent: enabled, code_mode_available: enabled },
      },
    }),
  )
  await page.reload()
  await page.getByRole("button", { name: "Run settings", exact: true }).click()
  await expect(page.getByRole("switch", { name: "Code mode", exact: true })).not.toBeChecked()
  await expect(page.getByRole("switch", { name: "Code mode", exact: true })).toBeDisabled()
  await expect(page.getByRole("switch", { name: "Subagent", exact: true })).not.toBeChecked()
  await page.keyboard.press("Escape")
  enabled = true
  await page.getByRole("button", { name: "New session", exact: true }).click()
  await page.getByRole("button", { name: "Run settings", exact: true }).click()
  await expect(page.getByRole("switch", { name: "Code mode", exact: true })).toBeChecked()
  await expect(page.getByRole("switch", { name: "Subagent", exact: true })).toBeChecked()
})

test("memory bindings preserve a conflicting draft, page collections and distinguish custom, disabled and automatic", async ({
  page,
}) => {
  const posts: unknown[] = []
  let selection: unknown = null
  await fixture(
    page,
    (input) => (input.action === "extension.list" ? [] : {}),
    "/component-tests/nexus-chat.html#/workspaces/one/conversations/conversation",
  )
  await page.route("**/api/7777/chats/conversation/memory*", async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith("memory-collections"))
      return route.fulfill({
        json: {
          items: [
            {
              public_id: url.searchParams.has("after") ? "second" : "first",
              name: url.searchParams.has("after") ? "Later notes" : "First notes",
              scope: "workspace",
            },
          ],
          next_after: url.searchParams.has("after") ? null : "later",
        },
      })

    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON()
      posts.push(body)

      if (posts.length === 1)
        return route.fulfill({ status: 409, json: { error: "Selection changed; keep this draft and refresh." } })
      selection = body.selection

      return route.fulfill({ json: {} })
    }

    return route.fulfill({
      json: {
        selection,
        effective: { bindings: [{ name: "workspace", scope: "workspace", access: "read", state: "ready" }] },
        writable: true,
      },
    })
  })
  await page.getByRole("button", { name: "Memory bindings", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Memory bindings", exact: true })
  await expect(dialog.getByText("workspace/ · workspace · Read only · ready", { exact: true })).toBeVisible()
  await dialog.getByRole("combobox", { name: "Memory selection", exact: true }).selectOption("custom")

  for (const index of [4, 3, 2])
    await dialog.getByRole("button", { name: "Remove binding " + index, exact: true }).click()
  const binding = dialog.getByRole("group", { name: "Binding 1", exact: true })
  await binding.getByRole("textbox", { name: "Name", exact: true }).fill("project_notes")
  await dialog.getByRole("button", { name: "Load more collections", exact: true }).click()
  await binding.getByRole("combobox", { name: "Source", exact: true }).selectOption("collection:second")
  await binding.getByRole("combobox", { name: "Access", exact: true }).selectOption("read")
  await dialog.getByRole("button", { name: "Save memory bindings", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Selection changed")
  await expect(binding.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("project_notes")
  await dialog.getByRole("button", { name: "Save memory bindings", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(posts).toEqual(
    Array(2).fill({
      selection: { bindings: [{ name: "project_notes", source: { collection_public_id: "second" }, access: "read" }] },
    }),
  )
  await page.getByRole("button", { name: "Memory bindings", exact: true }).click()
  await dialog.getByRole("combobox", { name: "Memory selection", exact: true }).selectOption("disabled")
  await dialog.getByRole("button", { name: "Save memory bindings", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(posts.at(-1)).toEqual({ selection: { bindings: [] } })
  await page.getByRole("button", { name: "Memory bindings", exact: true }).click()
  await dialog.getByRole("combobox", { name: "Memory selection", exact: true }).selectOption("automatic")
  await dialog.getByRole("button", { name: "Save memory bindings", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(posts.at(-1)).toEqual({ selection: null })
})
