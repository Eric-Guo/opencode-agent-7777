import { expect, test, type Page } from "@playwright/test"

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { executionExtensions } from "../../nexus-runtime/src/execution-settings"
import type { NexusPreset } from "@opencode/schema/nexus-preset"
import { Configuration } from "../../nexus-runtime/src/configuration"

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
          ...(url.searchParams.get("schedule") === "defaults" && {
            scheduleDefaults: await command({
              action: "schedule.defaults",
              workspace,
              conversation: url.pathname.split("/").at(-1),
            }),
          }),
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
            items: [
              { public_id: "one", name: "First workspace", dedicated: true },
              { public_id: "two", name: "Shared workspace", dedicated: false },
            ],
          },
        })

      const result = await command(input)
      if (result instanceof Error) return route.fulfill({status: 503, json: {error: result.message}})
      return route.fulfill({json: result})
    }

    return route.fulfill({ json: {} })
  })
  await page.goto(address)
  await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue(workspace)
}

test.describe("Electron header", () => {
  test.use({ userAgent: "Mozilla/5.0 Electron/44.0.0" })

  test("makes the top toolbar draggable and keeps its controls interactive", async ({ page }) => {
    await fixture(page, () => ({}))

    const toolbar = page.getByRole("navigation", { name: "Nexus administration" })
    const workspace = toolbar.getByRole("combobox", { name: "Workspace", exact: true })
    const workspaces = toolbar.getByRole("button", { name: "Workspaces", exact: true })
    await expect(toolbar).toHaveCSS("app-region", "drag")
    await expect(workspace).toHaveCSS("app-region", "no-drag")
    await expect(workspaces).toHaveCSS("app-region", "no-drag")

    await workspaces.click()
    const panel = page.getByRole("dialog", { name: "Workspaces", exact: true })
    await expect(panel.locator("header")).toHaveCSS("app-region", "drag")
    await expect(toolbar).toHaveCSS("app-region", "none")

    await panel.getByRole("button", { name: "Back to conversation" }).click()
    await expect(toolbar).toHaveCSS("app-region", "drag")
  })
})

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
  const plugin = page.getByRole("button", { name: "Fixture plugin", exact: true })
  await expect(plugin).toHaveAttribute("aria-expanded", "false")
  await plugin.click()
  await expect(plugin).toHaveAttribute("aria-expanded", "true")
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
  expect(await page.locator(".nexus-management-body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await page.locator(".nexus-management-body").evaluate((element) => element.clientWidth),
  )
  await plugin.click()
  await expect(plugin).toHaveAttribute("aria-expanded", "false")
  await expect(page.getByRole("spinbutton", { name: "count", exact: true })).toHaveCount(0)
  await page.getByRole("combobox", { name: "Workspace", exact: true }).selectOption("one")
  await expect(page.getByRole("dialog", { name: "Plugins", exact: true })).toHaveCount(0)
})

test("clearing a nullable plugin field restores its default rather than saving null", async ({ page }) => {
  const writes: Command[] = []
  await fixture(
    page,
    (input) => {
      if (input.action === "extension.list")
        return [
          {
            id: "fixture",
            name: "Fixture plugin",
            active: true,
            enabled: true,
            ready: true,
            configuration_version: 1,
            configuration_schema: {
              type: "object",
              properties: {
                endpoint: { type: ["string", "null"], default: "inherited" },
              },
            },
            configuration: { endpoint: "custom" },
            diagnostics: [],
            tools: [],
            commands: [],
            restart_required: false,
          },
        ]
      if (input.action === "extension.configure") writes.push(input)
      return { packages: [], saved: true, applied: true }
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/plugins/fixture",
  )
  await page.getByRole("textbox", { name: "endpoint", exact: true }).fill("")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({
    action: "extension.configure",
    change: { id: "fixture", operations: [{ op: "unset", path: ["endpoint"] }] },
  })
})

test("switching plugins replaces configuration fields and discards the previous plugin's draft", async ({ page }) => {
  const writes: Command[] = []
  await fixture(
    page,
    (input) => {
      if (input.action === "extension.list")
        return [
          { id: "first", name: "First plugin", key: "endpoint", value: "original" },
          { id: "second", name: "Second plugin", key: "directory", value: "saved" },
        ].map((row) => ({
          id: row.id,
          name: row.name,
          active: true,
          enabled: true,
          ready: true,
          configuration_version: 1,
          configuration_schema: { type: "object", properties: { [row.key]: { type: "string" } } },
          configuration: { [row.key]: row.value },
          diagnostics: [],
          tools: [],
          commands: [],
          restart_required: false,
        }))
      if (input.action === "extension.configure") writes.push(input)
      return { packages: [], saved: true, applied: true }
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/plugins/first",
  )
  await page.getByRole("textbox", { name: "endpoint", exact: true }).fill("unsaved")
  await page.getByRole("button", { name: "Second plugin", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "endpoint", exact: true })).toHaveCount(0)
  await page.getByRole("textbox", { name: "directory", exact: true }).fill("updated")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({
    action: "extension.configure",
    change: { id: "second", operations: [{ op: "set", path: ["directory"], value: "updated" }] },
  })
  await page.getByRole("button", { name: "First plugin", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "endpoint", exact: true })).toHaveValue("original")
  await expect(page.getByRole("textbox", { name: "directory", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
})

test("plugin maps expose saved entries alongside declared properties", async ({ page }) => {
  const writes: Command[] = []
  await fixture(
    page,
    (input) => {
      if (input.action === "extension.list")
        return [
          {
            id: "fixture",
            name: "Fixture plugin",
            active: true,
            enabled: true,
            ready: true,
            configuration_version: 1,
            configuration_schema: {
              type: "object",
              properties: {
                servers: {
                  type: "object",
                  properties: { primary: { type: "string" } },
                  additionalProperties: { type: "string" },
                },
              },
            },
            configuration: { servers: { primary: "first", extra: "saved" } },
            diagnostics: [],
            tools: [],
            commands: [],
            restart_required: false,
          },
        ]
      if (input.action === "extension.configure") writes.push(input)
      return { packages: [], saved: true, applied: true }
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/plugins/fixture",
  )
  await expect(page.getByRole("textbox", { name: "primary", exact: true })).toHaveValue("first")
  await page.getByRole("textbox", { name: "extra", exact: true }).fill("updated")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({
    action: "extension.configure",
    change: { id: "fixture", operations: [{ op: "set", path: ["servers", "extra"], value: "updated" }] },
  })
})

test("rejects invalid configuration JSON and distinguishes inherited fallback from an empty list", async ({ page }) => {
  const writes: Command[] = []
  await fixture(page, (input) => {
    if (input.action === "extension.list") return []

    if (input.action === "preset.list")
      return { presets: [], main_preset_public_id: "", default_bot_preset_public_id: "" }
    if (input.action === "preset.tools") return {tools: [], mcp_connections: []}
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
  const toggle = page.getByRole("switch", { name: "Enable Fixture plugin", exact: true })
  await expect(toggle).toBeEnabled()
  await expect(toggle).toBeChecked()
  await toggle.press("Space")
  await expect(toggle).not.toBeChecked()
  await page.getByRole("button", { name: "Back to conversation" }).click()
  await page.getByRole("button", { name: "Settings & account" }).click()
  await expect(page.getByText("Module v2 ready", { exact: true })).toHaveCount(0)
})

test("failed browser modules stay failed until their version changes or they are re-enabled", async ({ page }) => {
  let version = "v1"
  let enabled = true
  let reads = 0
  await page.route("**/api/7777/modules/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export function register(ui) {
      document.documentElement.dataset.moduleRegistrations = String(Number(document.documentElement.dataset.moduleRegistrations ?? 0) + 1);
      ui.slots.register('sidebar.panellist', { id: 'fixture', label: 'Recovered module' }, () => ({element: document.createElement('p')}));
      ${version === "v1" ? "throw new Error('registration failed');" : ""}
    }`,
    }),
  )
  await fixture(
    page,
    (input) => {
      if (input.action === "extension.list") {
        reads++
        return [
          {
            id: "fixture",
            name: "Fixture plugin",
            active: enabled,
            enabled,
            ready: true,
            configuration_version: 1,
            configuration_schema: { type: "object", properties: {} },
            configuration: {},
            diagnostics: [],
            tools: [],
            commands: [],
            restart_required: false,
            webui: { version, entry: "index.js" },
          },
        ]
      }
      return { packages: [] }
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/plugins/fixture",
  )
  const registrations = () => page.evaluate(() => Number(document.documentElement.dataset.moduleRegistrations))
  await expect(page.getByText("registration failed", { exact: true })).toBeVisible()
  await expect.poll(registrations).toBe(1)
  await expect(page.getByRole("button", { name: "Recovered module", exact: true })).toHaveCount(0)
  const before = reads
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect.poll(() => reads).toBeGreaterThan(before)
  await expect.poll(registrations).toBe(1)
  enabled = false
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByText("registration failed", { exact: true })).toHaveCount(0)
  enabled = true
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect.poll(registrations).toBe(2)
  await expect(page.getByText("registration failed", { exact: true })).toBeVisible()
  version = "v2"
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("button", { name: "Recovered module", exact: true })).toBeVisible()
  await expect(page.getByText("registration failed", { exact: true })).toHaveCount(0)
  await expect.poll(registrations).toBe(3)
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

test("workspace schedules stop after five pages and open the latest child from the next page", async ({ page }) => {
  const cursors: unknown[] = []
  await fixture(page, (input) => {
    if (input.action !== "schedule.list") return []
    cursors.push(input.after)
    const index = Number(input.after ?? 1)
    return {
      items: [
        {
          public_id: "job-" + index,
          name: "Job " + index,
          prompt: "Report",
          status: "active",
          conversation_public_id: "owner",
          rule: { kind: "interval", every_seconds: 60 },
          last_execution: { status: "completed", child_conversation_public_id: "child-" + index },
        },
      ],
      next_after: index < 6 ? String(index + 1) : null,
    }
  })
  await page.getByRole("button", { name: "Schedules", exact: true }).click()
  const more = page.getByRole("button", { name: "Load more jobs" })
  await expect(more).toBeVisible()
  expect(cursors).toEqual([undefined, "2", "3", "4", "5"])
  await more.click()
  await expect(more).toHaveCount(0)
  expect(cursors).toEqual([undefined, "2", "3", "4", "5", "6"])
  const articles = page.locator(".nexus-management article")
  await expect(articles).toHaveCount(6)
  await articles.filter({ hasText: "Job 6" }).getByRole("button", { name: "Latest execution: completed" }).click()
  await expect(page).toHaveURL(/#\/workspaces\/one\/conversations\/child-6$/)
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
    {
      ...job("Earlier", "active", "2030-01-01T00:00:37.123Z"),
      approval_mode: null,
      conversation_title: "Build reports",
      last_error_code: "model_unavailable",
    },
    job("Finished", "completed", "2030-01-01T00:00:00Z"),
  ]

  await fixture(page, (input) => {
    if (input.action === "extension.list") return []

    if (input.action === "schedule.list")
      return input.after
        ? { items: jobs.slice(1), next_after: null }
        : { items: jobs.slice(0, 1), next_after: "second-page" }

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
  await expect(articles.nth(0)).toContainText("Build reports")
  await expect(articles.nth(0)).toContainText("model_unavailable")
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
  expect(writes.find((row) => row.action === "schedule.update")).toEqual({
    action: "schedule.update",
    workspace: "one",
    conversation: "conversation",
    id: "Earlier",
    version: 2,
    prompt: "Changed prompt",
  })

  await articles.nth(0).getByRole("button", { name: "Edit", exact: true }).click()
  const firstRun = page.getByLabel("First run", { exact: true })
  expect(await firstRun.inputValue()).toMatch(/:37$/)
  await page.getByLabel("Every (seconds)").fill("7200")
  await page.getByRole("button", { name: "Save job", exact: true }).click()
  await expect.poll(() => writes.filter((row) => row.action === "schedule.update").length).toBe(2)
  expect(writes.at(-1)).toMatchObject({
    rule: { kind: "interval", every_seconds: 7200, starts_at: "2030-01-01T00:00:37.123Z" },
  })

  await articles.nth(0).getByRole("button", { name: "Edit", exact: true }).click()
  await firstRun.fill("2031-02-03T12:34:56")
  await page.route("**/api/7777/manage", async (route) => {
    const input = route.request().postDataJSON() as Command
    if (input.action !== "schedule.update") return route.fallback()

    writes.push(input)
    return route.fulfill({ status: 409, json: { error: "This job changed. Refresh to use its current version." } })
  })
  await page.getByRole("button", { name: "Save job", exact: true }).click()
  await expect(page.getByText("This job changed. Refresh to use its current version.")).toBeVisible()
  expect(await firstRun.inputValue()).toBe("2031-02-03T12:34:56")
  expect(writes.at(-1)).toEqual({
    action: "schedule.update",
    workspace: "one",
    conversation: "conversation",
    id: "Earlier",
    version: 2,
    rule: {
      kind: "interval",
      every_seconds: 3600,
      starts_at: await page.evaluate(() => new Date("2031-02-03T12:34:56").toISOString()),
    },
  })
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
  await page.getByRole("button", { name: "Fixture plugin", exact: true }).click()
  await expect(page).toHaveURL(/\/panels\/plugins\/fixture$/)
  await page.reload()
  await expect(page.getByRole("spinbutton", { name: "count", exact: true })).toHaveValue("2")
})

test("Bot creation and duplicate names fit Nexus handles", async ({ page }) => {
  const writes: Command[] = []
  await fixture(
    page,
    (input) => {
      if (input.action === "bot.list")
        return [
          {
            public_id: "existing",
            name: "bot-abcdefghijklmnopqrstuvwxyz12",
            display_name: "Long named Bot",
            description: "Saved Bot",
            current: null,
            settings: { audience: "owner", preset_public_id: "default", subagent: true, welcome_message: null },
          },
        ]
      if (input.action === "preset.list")
        return {
          presets: [{ public_id: "default", name: "Default", description: "", configuration: {} }],
          default_bot_preset_public_id: "default",
        }
      writes.push(input)
      return {}
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/bots",
  )
  await page.getByRole("button", { name: "Duplicate as personal Bot", exact: true }).click()
  await expect
    .poll(() => writes.find((input) => input.action === "bot.duplicate")?.name)
    .toBe("abcdefghijklmnopqrstuvw-copy")
  await page.getByRole("button", { name: "New Bot", exact: true }).click()
  const name = page.getByRole("textbox", { name: "Stable name", exact: true })
  await name.pressSequentially("abcdefghijklmnopqrstuvwxyz123")
  await expect(name).toHaveValue("abcdefghijklmnopqrstuvwxyz12")
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

test("independent defaults edits survive a delayed catalog, a refused save and a refresh", async ({
  page,
  context,
}) => {
  const saved = {
    default_model: "retired/default",
    conversation_title_model: "retired/title",
    fallback_models: [],
    kernel_tools: ["nexus.memory.read", "retired.tool"],
    subagent_default: true,
    adaptations: "auto",
    adaptations_dir: null,
  }
  const patches: unknown[] = []
  let refuse = true
  const command = (input: Command) => {
    if (input.action === "extension.list") return []
    if (input.action === "settings.read") return saved
    if (input.action === "settings.update") {
      patches.push(input.patch)
      if (refuse) return new Error("Refused defaults")
      return Object.assign(saved, input.patch)
    }
    return {}
  }
  const second = await context.newPage()
  await fixture(page, command)
  await fixture(second, command)
  await second.route("**/choices", (route) => route.fulfill({ status: 503, json: { error: "Models offline" } }))
  const connection = Promise.withResolvers<void>()
  await second.route("**/api/7777/connection*", async (route) => {
    await connection.promise
    await route.fallback()
  })
  await second.reload()
  const catalog = Promise.withResolvers<void>()
  await page.route("**/settings/kernel-tools", async (route) => {
    await catalog.promise
    await route.fulfill({
      json: [
        { canonical: "nexus.memory.write", name: "write" },
        { canonical: "nexus.memory.read", name: "read" },
        { canonical: "nexus.graph.spawn", name: "spawn" },
      ],
    })
  })
  await second.route("**/settings/kernel-tools", (route) => route.fulfill({ status: 503, json: { error: "offline" } }))
  for (const tab of [page, second]) await tab.getByRole("button", { name: "Settings & account" }).click()
  connection.resolve()

  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveValue("retired/default")
  await expect(second.getByRole("combobox", { name: "Automatic title model", exact: true })).toHaveValue(
    "retired/title",
  )
  await expect(second.getByText("Catalog unavailable.", { exact: false })).toBeVisible()
  await page.getByText("retired.tool", { exact: true }).click()
  catalog.resolve()
  await expect(page.getByRole("checkbox", { name: "retired.tool" })).not.toBeChecked()
  await page.getByText("nexus.graph.spawn", { exact: true }).click()
  await page.getByText("nexus.memory.write", { exact: true }).click()
  await page.getByRole("button", { name: "Save defaults" }).click()
  await expect(page.getByText("Refused defaults")).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "nexus.graph.spawn" })).toBeChecked()

  refuse = false
  await second.getByLabel("Enable subagents by default").uncheck()
  await second.getByRole("button", { name: "Save defaults" }).click()
  await expect(second.getByText("Defaults saved for new conversations.")).toBeVisible()
  await page.getByRole("button", { name: "Refresh connection" }).click()
  await expect(page.getByLabel("Enable subagents by default")).not.toBeChecked()
  await expect(page.getByRole("checkbox", { name: "nexus.graph.spawn" })).toBeChecked()
  await page.getByRole("button", { name: "Save defaults" }).click()
  await expect(page.getByText("Defaults saved for new conversations.")).toBeVisible()
  const tools = { kernel_tools: ["nexus.memory.read", "nexus.memory.write", "nexus.graph.spawn"] }
  expect(patches).toEqual([tools, { subagent_default: false }, tools])
  expect(saved).toMatchObject({
    ...tools,
    subagent_default: false,
    default_model: "retired/default",
    conversation_title_model: "retired/title",
  })
})

test("member-token settings skip unavailable persona controls and reconnect the selected conversation", async ({
  page,
}) => {
  const state: { account: { id: string; role: string } | null } = { account: null }
  let persona: { content: string } | null = { content: "Saved persona" }
  const commands: string[] = []
  const connections: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/api/7777/connection")) connections.push(new URL(request.url()).search)
  })
  await fixture(
    page,
    (input) => {
      commands.push(input.action)

      if (input.action === "extension.list") return []

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

      if (input.action === "persona.read") return persona
      if (input.action === "persona.reset") persona = null

      return {}
    },
    "/component-tests/nexus-chat.html#/workspaces/two/conversations/conversation",
    "two",
  )
  await page.route("**/api/7777/setup", (route) =>
    route.fulfill({
      json: { status: { state: "ready", origin: "https://nexus.example" }, account: state.account },
    }),
  )
  await page.getByRole("button", { name: "Settings & account", exact: true }).click()
  const refresh = page.getByRole("button", { name: "Refresh connection", exact: true })

  await expect(refresh).toBeEnabled()
  await expect(page.getByRole("button", { name: "Save defaults", exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Persona instructions", exact: true })).toHaveCount(0)
  expect(commands).not.toContain("persona.read")
  await refresh.click()
  await expect.poll(() => connections.length).toBe(2)
  expect(connections.at(-1)).toBe("?workspace=two")
  await page.getByRole("button", { name: "Back to conversation", exact: true }).click()
  await expect(page).toHaveURL(/\/workspaces\/two\/conversations\/conversation$/)
  await expect(page.getByRole("heading", { name: "Navigation chat", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Settings & account", exact: true }).click()
  state.account = { id: "other-human", role: "admin" }
  await refresh.click()
  await expect(refresh).toBeEnabled()
  await expect(page.getByRole("textbox", { name: "Persona instructions", exact: true })).toHaveCount(0)
  expect(commands).not.toContain("persona.read")
  state.account = { id: "human", role: "member" }
  await refresh.click()
  await expect(page.getByRole("textbox", { name: "Persona instructions", exact: true })).toHaveValue("Saved persona")
  await page.getByRole("button", { name: "Reset persona" }).click()
  await expect(page.getByRole("textbox", { name: "Persona instructions", exact: true })).toHaveValue("")
  await refresh.click()
  await expect(page.getByRole("button", { name: "Save persona" })).toBeEnabled()
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("Bot editors retain unavailable Home Workspaces and respect fixed external audiences", async ({ page }) => {
  const bot = {
    public_id: "external",
    name: "bot-external",
    display_name: "External Bot",
    description: "Saved Bot",
    settings: {
      audience: "external",
      preset_public_id: "preset",
      home_workspace_public_id: "unavailable-home",
      subagent: false,
      welcome_message: "",
    },
    current: null,
  }

  const writes: Command[] = []
  await fixture(
    page,
    (input) => {
      if (input.action === "extension.list") return []

      if (input.action === "bot.list") return [bot]

      if (input.action === "preset.list")
        return {
          presets: [{ public_id: "preset", name: "Preset", description: "", configuration: {} }],
          default_bot_preset_public_id: "preset",
          main_preset_public_id: "preset",
        }

      if (input.action === "bot.configure") {
        writes.push(input)
        Object.assign(bot.settings, input.settings)

        return bot
      }

      return {}
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/bots/external",
  )
  const home = page.getByRole("combobox", { name: "Home Workspace", exact: true })
  const audience = page.getByRole("combobox", { name: "Audience", exact: true })
  const start = page.getByRole("button", { name: "New conversation", exact: true })

  await expect(home).toHaveValue("unavailable-home")
  await expect(home.locator("option:checked")).toHaveText("unavailable-home (unavailable)")
  await expect(audience).toBeDisabled()
  await expect(start).toBeDisabled()
  await home.selectOption("two")
  await page.getByRole("button", { name: "Save Bot", exact: true }).click()
  await expect(start).toBeEnabled()
  expect(writes[0].settings).toMatchObject({ audience: "external", home_workspace_public_id: "two" })
  await home.selectOption("")
  await page.getByRole("button", { name: "Save Bot", exact: true }).click()
  await expect(start).toBeDisabled()
  await page.getByRole("button", { name: "New Bot", exact: true }).click()
  await expect(audience).toBeEnabled()
})

test("terminal creation retries the selected runner and key after reload", async ({ page }) => {
  const creates: { scope: string; body: Command }[] = []
  await fixture(page, (input) =>
    input.name === "runners"
      ? {
          runners: [
            { public_id: "reader", display_name: "Reader", tools: ["read"] },
            { public_id: "runner", display_name: "Local", tools: ["terminal"] },
            { public_id: "remote", display_name: "Remote", tools: ["terminal"] },
          ],
        }
      : [],
  )
  await page.route("**/api/7777/terminals*", async (route) => {
    const request = route.request()
    if (request.method() === "GET") return route.fulfill({ json: { items: [], next: null } })
    const body = request.postDataJSON()
    if (body.action === "read")
      return route.fulfill({ json: { task: { status: "timed_out", error: { message: "Terminal expired" } } } })
    creates.push({ scope: request.headers()["x-7777-scope"], body })
    if (creates.length === 1) return route.fulfill({ status: 503, json: { error: "Response lost" } })
    return route.fulfill({ json: { run: "run", task: "terminal" } })
  })
  await page.getByRole("button", { name: "Terminals", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Terminals", exact: true })
  const runner = dialog.getByRole("combobox", { name: "Runner" })
  await expect(runner.locator("option")).toHaveText(["Local", "Remote"])
  await runner.selectOption("remote")
  await dialog.getByRole("button", { name: "New terminal" }).click()
  const retry = dialog.getByRole("button", { name: "Retry terminal creation" })
  await expect(retry).toBeEnabled()
  await page.reload()
  await expect(runner).toBeDisabled()
  await expect(runner).toHaveValue("remote")
  await retry.click()
  await expect(dialog.getByRole("status")).toHaveText("timed_out")
  await expect(dialog.getByRole("alert")).toHaveText("Terminal expired")
  expect(creates).toHaveLength(2)
  expect(creates[0]).toEqual(creates[1])
  expect(creates[0].body).toEqual({ action: "create", runner: "remote", key: expect.any(String) })
})

test("terminal screen survives peer replacement and resets only for a new output gap", async ({ page }) => {
  await fixture(page, (input) => (input.name === "runners" ? { runners: [] } : []))
  const runner = () =>
    page.evaluateHandle(async () => {
      const peer = new RTCPeerConnection({ iceServers: [] })
      const terminal = peer.createDataChannel("terminal", { negotiated: true, id: 0 })
      const permission = peer.createDataChannel("permission", { negotiated: true, id: 1 })
      const offsets: number[] = []
      permission.onmessage = (event) => permission.send(JSON.stringify({ nonce: Number(event.data), max_age_ms: 1000 }))
      terminal.onmessage = (event) => {
        const frame = JSON.parse(event.data)
        if (frame.type === "resume") offsets.push(frame.offset)
      }
      await peer.setLocalDescription(await peer.createOffer())
      if (peer.iceGatheringState !== "complete")
        await new Promise<void>((resolve) => {
          peer.onicegatheringstatechange = () => {
            if (peer.iceGatheringState === "complete") resolve()
          }
        })
      return { peer, terminal, offsets, offer: peer.localDescription!.sdp }
    })
  let current = await runner()
  let generation = 1
  await page.route("**/api/7777/terminals**", async (route) => {
    if (route.request().url().endsWith("/config")) return route.fulfill({ json: { iceServers: [] } })
    if (route.request().method() === "GET")
      return route.fulfill({ json: { items: [{ run: "run", task: "terminal", status: "running" }], next: null } })
    const input = route.request().postDataJSON()
    if (input.action === "read") return route.fulfill({ json: { task: { status: "running" }, writable: true } })
    if (input.action === "answer") {
      await current.evaluate((r, sdp) => r.peer.setRemoteDescription({ type: "answer", sdp }), input.sdp)
      return route.fulfill({ json: {} })
    }
    return route.fulfill({
      json: { status: "active", connection_id: String(generation), offer_sdp: await current.evaluate((r) => r.offer) },
    })
  })
  await page.getByRole("button", { name: "Terminals", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Terminals", exact: true })
  await dialog.getByRole("button", { name: "Attach", exact: true }).click()
  const screen = dialog.locator(".xterm-rows")
  const send = (frame: object) => current.evaluate((r, data) => r.terminal.send(JSON.stringify(data)), frame)
  await expect.poll(() => current.evaluate((r) => r.offsets)).toContain(0)
  await send({ type: "output", offset: 0, data: btoa("first") })
  await expect(screen).toContainText("first")
  const previous = current
  const next = await runner()
  current = next
  generation++
  await previous.evaluate((r) => r.peer.close())
  await expect.poll(() => current.evaluate((r) => r.offsets)).toContain(5)
  await send({ type: "output", offset: 5, data: btoa(" second") })
  await expect(screen).toContainText("first second")
  await send({ type: "gap", from: 12, to: 20 })
  await expect(dialog.getByText("Screen refreshed. 8 bytes of older output are no longer available.")).toBeVisible()
  await expect(screen).not.toContainText("first")
  await send({ type: "output", offset: 20, data: btoa("third") })
  await expect(screen).toContainText("third")
  await send({ type: "gap", from: 12, to: 20 })
  await send({ type: "output", offset: 25, data: btoa(" fourth") })
  await expect(screen).toContainText("third fourth")
  await current.evaluate((r) => r.peer.close())
})

test("terminal viewers follow write access and disable controls when access is revoked", async ({ page }) => {
  const state = { writable: false, unavailable: false }
  const signals: string[] = []

  await fixture(page, (input) => (input.name === "runners" ? { runners: [] } : []))
  await page.route("**/api/7777/terminals", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { items: [{ run: "run", task: "terminal", status: "running" }], next: null } })
    const input = route.request().postDataJSON() as Command

    if (input.action !== "read") {
      signals.push(input.action)

      return route.fulfill({ json: {} })
    }

    if (state.unavailable) return route.fulfill({ status: 403, json: { error: "Terminal access ended" } })

    return route.fulfill({
      json: { task: { status: state.writable ? "needs_approval" : "dispatched" }, writable: state.writable },
    })
  })
  await page.getByRole("button", { name: "Terminals", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Terminals", exact: true })

  await dialog.getByRole("button", { name: "Attach", exact: true }).click()
  await expect(dialog.getByRole("status")).toHaveText("Read-only terminal")
  await expect(dialog.getByRole("button", { name: "Stop terminal", exact: true })).toBeDisabled()
  await expect(dialog.locator(".xterm-helper-textarea")).toHaveCount(0)
  state.writable = true
  await expect(dialog.getByRole("status")).toHaveText("Terminal requires approval")
  await expect(dialog.getByRole("button", { name: "Approve terminal", exact: true })).toBeEnabled()
  state.unavailable = true
  await expect(dialog.getByRole("status")).toHaveText("Terminal unavailable")
  await expect(dialog.getByRole("alert")).toHaveText("Terminal access ended")
  await expect(dialog.getByRole("button", { name: "Stop terminal", exact: true })).toBeDisabled()
  await expect(dialog.getByRole("button", { name: "Approve terminal", exact: true })).toBeDisabled()
  await dialog.getByRole("button", { name: "Attach", exact: true }).click()
  await expect(dialog.getByRole("status")).toHaveText("Terminal unavailable")
  await expect(dialog.getByRole("button", { name: "Stop terminal", exact: true })).toBeDisabled()
  expect(signals).toEqual([])
})


test("built-in settings save defaults and atomic hook groups without carrying drafts across plugins", async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-ui-settings-"))
  const configuration = new Configuration(join(directory, "configuration.json"))
  const descriptors = executionExtensions().map((module) => module.descriptor)
  try {
    await fixture(page, async (input) => {
      if (input.action === "extension.list") return descriptors.map((descriptor) => ({
        ...descriptor,
        ...configuration.selection(descriptor),
        active: configuration.selection(descriptor).enabled,
        ready: true,
        restart_required: false,
        tools: [], commands: [], diagnostics: [],
      }))
      if (input.action === "extension.configure") {
        const change = input.change as Parameters<Configuration["change"]>[1]
        await configuration.change(descriptors.find((row) => row.id === change.id)!, change)
        return { applied: true }
      }
      return { packages: [] }
    }, "/component-tests/nexus-chat.html#/workspaces/one/panels/plugins/nexus.coding")
    const timeout = page.getByRole("spinbutton", { name: "bash_timeout_seconds", exact: true })
    await expect(timeout).toHaveValue("120")
    await timeout.fill("42")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect.poll(() => configuration.saved("nexus.coding")?.configuration).toEqual({ bash_timeout_seconds: 42 })
    await timeout.fill("48")
    await page.getByRole("button", { name: "Checkpoints", exact: true }).click()
    await expect(page.getByRole("spinbutton", { name: "retention_days", exact: true })).toHaveValue("7")
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
    await page.getByRole("spinbutton", { name: "max_tree_bytes", exact: true }).fill("4096")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect.poll(() => configuration.saved("nexus.checkpoints")?.configuration).toEqual({ max_tree_bytes: 4096 })
    await page.getByRole("button", { name: "Lifecycle hooks", exact: true }).click()
    const stop = page.getByRole("textbox", { name: /^stop Value/ })
    await stop.fill("{")
    await expect(stop).toHaveAttribute("aria-invalid", "true")
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
    expect(configuration.saved("nexus.lifecycle-hooks")).toBeUndefined()
    const hook = { tool: "verify", timeout_ms: 30000, max_continuations: 2 }
    await stop.fill(JSON.stringify(hook))
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect.poll(() => configuration.saved("nexus.lifecycle-hooks")?.configuration).toEqual({ stop: hook })
    await page.reload()
    await expect(page.getByRole("textbox", { name: /^stop Value/ })).toHaveValue(JSON.stringify(hook, null, 2))
    await page.getByRole("button", { name: "Coding", exact: true }).click()
    await expect(timeout).toHaveValue("42")
    await page.getByRole("button", { name: "Restore default", exact: true }).click()
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(timeout).toHaveValue("120")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Preset discovery preserves independent MCP choices, unavailable selections and the open draft", async ({
  page,
}) => {
  const saved: NexusPreset.Entry = {
    name: "Selected",
    description: "Before",
    public_id: "saved",
    role: null,
    configuration: {
      tools: ["gone"],
      mcp: {
        disabled_connections: [],
        disabled_tools: [{ source: "executor", executor_public_id: "paired", server_key: "files", tool_name: "old" }],
      },
    },
  }
  let failing = false
  await fixture(page, (input) => {
    if (input.action === "preset.list")
      return { presets: [saved], main_preset_public_id: "saved", default_bot_preset_public_id: "saved" }
    if (input.action === "preset.tools")
      return failing
        ? new Error("Discovery unavailable")
        : {
            tools: [
              { kind: "kernel", name: "memory_read", canonical: "nexus.memory.read" },
              { kind: "agent", name: "web_fetch" },
              { kind: "runner", name: "read" },
            ],
            mcp_connections: ["local", "other"].map((id) => ({
              ref: { source: "executor", executor_public_id: id, server_key: "files" },
              ...(id === "local" && {
                previous_ref: { source: "executor", executor_public_id: "paired", server_key: "files" },
              }),
              name: "files",
              account_label: id,
              available: true,
              tools: [{ name: "read", description: "Read files" }],
            })),
          }
    if (input.action === "preset.replace") return Object.assign(saved, input.value)
    return []
  })
  await page.getByRole("button", { name: "Presets", exact: true }).click()
  const editor = page.getByRole("dialog", { name: "Presets" })
  await editor.getByRole("button", { name: "Edit", exact: true }).click()
  const local = editor.getByRole("group", { name: "files · local", exact: true })
  const other = editor.getByRole("group", { name: "files · other", exact: true })
  await expect(local.getByRole("checkbox", { name: "old", exact: true })).not.toBeChecked()
  await expect(editor.getByRole("checkbox", { name: "gone", exact: true })).toBeChecked()
  await editor.getByText("memory_read", { exact: true }).click()
  await editor.getByText("web_fetch", { exact: true }).click()
  const runner = editor.getByRole("group", { name: "Runner tools", exact: true })
  await expect(runner.getByRole("checkbox", { name: "Restrict selected tools" })).not.toBeChecked()
  await runner.getByText("Restrict selected tools", { exact: true }).click()
  await local.getByText("read", { exact: true }).click()
  await local.getByText("Use files", { exact: true }).click()
  await expect(other.getByRole("checkbox", { name: "read", exact: true })).toBeChecked()
  await local.getByText("Use files", { exact: true }).click()
  await expect(local.getByRole("checkbox", { name: "read", exact: true })).not.toBeChecked()
  await editor.getByRole("textbox", { name: "Description", exact: true }).fill("Draft")
  failing = true
  await editor.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(editor.getByRole("alert")).toContainText("Discovery unavailable")
  await expect(editor.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("Draft")
  expect(saved.description).toBe("Before")
  failing = false
  await editor.getByRole("button", { name: "Save Preset", exact: true }).click()
  await expect.poll(() => saved.description).toBe("Draft")
  expect(saved.configuration).toMatchObject({
    tools: ["gone", "memory_read", "web_fetch"],
    runner_tool_names: [],
    mcp: {
      disabled_connections: [],
      disabled_tools: [
        { source: "executor", executor_public_id: "paired", server_key: "files", tool_name: "old" },
        { source: "executor", executor_public_id: "local", server_key: "files", tool_name: "read" },
      ],
    },
  })
  await page.reload()
  await editor.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(local.getByRole("checkbox", { name: "read", exact: true })).not.toBeChecked()
  const advanced = editor.getByRole("textbox", { name: "Advanced configuration, including MCP selections" })
  await advanced.fill(JSON.stringify({ ...saved.configuration, runner_tool_names: ["read"] }))
  await expect(runner.getByRole("checkbox", { name: "read", exact: true })).toBeChecked()
})

test("T3 project and default agent controls use runtime discovery and retain unsaved choices after a refusal", async ({
  page,
}) => {
  const config: Record<string, string> = { project_id: "missing", default_agent: "retired" }
  let failing = true
  let offline = false
  const calls: string[] = []
  await fixture(page, (input) => {
    if (input.action === "extension.list")
      return [
        {
          id: "nexus.t3",
          name: "Coding delegation",
          active: true,
          enabled: true,
          ready: true,
          configuration_version: 1,
          configuration_schema: { type: "object", properties: {} },
          configuration: config,
          diagnostics: [],
          tools: [],
          restart_required: false,
        },
      ]
    if (input.action === "extension.call") {
      calls.push(String(input.name))
      if (input.name === "t3.status")
        return { project_id: config.project_id, ready: true, issues: [], bearer: "saved", url: "http://peer" }
      if (input.name === "t3.projects")
        return offline ? new Error("T3 offline") : [{ id: "one", title: "Repository", workspaceRoot: "/work" }]
      if (input.name === "t3.agents")
        return [
          { agent: "codex", available: true, reason: null },
          { agent: "offline", available: false, reason: "No provider" },
        ]
      if (input.name === "t3.project") {
        if (failing) return new Error("Project permission denied")
        config.project_id = (input.input as { id: string }).id
        return { id: config.project_id }
      }
    }
    if (input.action === "extension.configure") {
      const op = (input.change as { operations: { op: string; path: string[]; value?: string }[] }).operations[0]
      expect(op.path).toEqual(["default_agent"])
      if (op.op === "unset") delete config.default_agent
      else config.default_agent = op.value!
      return {}
    }
    return []
  })
  await page.getByRole("button", { name: "Integrations", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Integrations" })
  await dialog.getByRole("button", { name: "T3", exact: true }).click()
  const project = dialog.getByRole("combobox", { name: "T3 project" })
  const agent = dialog.getByRole("combobox", { name: "Default coding agent" })
  await expect(project).toHaveValue("missing")
  await expect(agent).toHaveValue("retired")
  await expect(dialog.getByText("T3 configuration ready.")).toBeVisible()
  await expect(dialog.getByText("offline · No provider", { exact: true }).last()).toBeVisible()
  await project.selectOption("one")
  await agent.selectOption("codex")
  await dialog.getByRole("button", { name: "Use project", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Project permission denied")
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(project).toHaveValue("one")
  await expect(agent).toHaveValue("codex")
  offline = true
  await dialog.getByRole("button", { name: "Refresh T3", exact: true }).click()
  await expect(dialog.getByRole("alert").filter({ hasText: "T3 offline" })).toBeVisible()
  await expect(project).toHaveValue("one")
  await expect(agent).toHaveValue("codex")
  await expect(agent.locator("option:checked")).toHaveText("codex")
  offline = false
  await dialog.getByRole("button", { name: "Refresh T3", exact: true }).click()
  failing = false
  await dialog.getByRole("button", { name: "Use project", exact: true }).click()
  await expect.poll(() => config.project_id).toBe("one")
  await dialog.getByRole("button", { name: "Save default agent" }).click()
  await expect.poll(() => config.default_agent).toBe("codex")
  await page.reload()
  await dialog.getByRole("button", { name: "T3", exact: true }).click()
  await expect(project).toHaveValue("one")
  await expect(agent).toHaveValue("codex")
  await agent.selectOption("")
  await dialog.getByRole("button", { name: "Save default agent" }).click()
  await expect.poll(() => config.default_agent).toBeUndefined()
  expect(calls).toEqual(expect.arrayContaining(["t3.status", "t3.agents", "t3.projects", "t3.project"]))
})

test("scheduled job links reload the scoped job and its history outside the overview", async ({ page }) => {
  const reads: Command[] = []
  await fixture(
    page,
    (input) => {
      reads.push(input)
      if (input.action === "schedule.read")
        return {
          public_id: "off-page",
          conversation_public_id: "parent",
          name: "Nightly job",
          prompt: "Run the report",
          writable: false,
          status: "paused",
          rule: { kind: "daily", local_time: "09:00", time_zone: "UTC" },
        }
      if (input.action === "schedule.executions")
        return {
          items: [
            { child_conversation_public_id: "child", status: "completed", scheduled_for: "2030-01-01T09:00:00Z" },
          ],
          next_after: null,
        }
      if (input.action === "schedule.list") return { items: [], next_after: null }
      return []
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/schedules/parent%2Foff-page",
  )
  await expect(page.getByText("Read-only conversation")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("button", { name: "Open execution" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Run now" })).toHaveCount(0)
  expect(reads.filter((row) => row.action === "schedule.read")).toEqual(
    Array(2).fill({ action: "schedule.read", workspace: "one", conversation: "parent", id: "off-page" }),
  )
  expect(reads.some((row) => row.action === "schedule.list")).toBe(false)
  await page.getByRole("button", { name: "All scheduled jobs" }).click()
  await expect(page.getByRole("heading", { name: "New scheduled job" })).toBeVisible()
})

test("a scheduled draft inherits the chosen conversation and retries the original time and key", async ({ page }) => {
  const writes: Command[] = []
  const now = new Date("2030-06-01T00:00:00Z")
  await page.clock.setFixedTime(now)
  await fixture(
    page,
    (input) => {
      if (input.action === "schedule.defaults") return { model: "provider/model", approval: "rules" }
      if (input.action === "schedule.list") return { items: [], next_after: null }
      if (input.action === "schedule.create") {
        writes.push(input)
        return writes.length === 1 ? new Error("Retry this schedule") : {}
      }
      return []
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/schedules",
  )
  await page.getByRole("combobox", { name: "Conversation", exact: true }).selectOption("conversation")
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveValue("provider/model")
  await expect(page.getByRole("combobox", { name: "Permissions", exact: true })).toHaveValue("rules")
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("Retain this prompt")
  await page.getByRole("button", { name: "Save job" }).click()
  await expect(page.getByText("Retry this schedule")).toBeVisible()
  await page.clock.setFixedTime(new Date(now.getTime() + 60000))
  await page.getByRole("button", { name: "Save job" }).click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[0]).toMatchObject({
    conversation: "conversation",
    model: "provider/model",
    approval: "rules",
    prompt: "Retain this prompt",
    rule: { kind: "once", run_at: "2030-06-01T00:30:00.000Z" },
  })
  expect(writes[1]).toEqual(writes[0])
})

test("a delivered job result refreshes open history and preserves the edit's original version", async ({ page }) => {
  await page.clock.install()
  let delivered = false
  const writes: Command[] = []
  const execution = (id: string, status: string) => ({
    child_conversation_public_id: id,
    status,
    scheduled_for: "2030-01-01T09:00:00Z",
  })
  await fixture(
    page,
    (input) => {
      if (input.action === "schedule.read")
        return {
          public_id: "job",
          conversation_public_id: "parent",
          prompt: delivered ? "Another operator's edit" : "Original prompt",
          rule: { kind: "daily", local_time: "09:00", time_zone: "UTC" },
          status: "active",
          lock_version: delivered ? 3 : 2,
          last_execution: execution("latest", delivered ? "completed" : "running"),
        }
      if (input.action === "schedule.executions")
        return input.after
          ? { items: [execution("latest", delivered ? "completed" : "running")], next_after: null }
          : { items: [execution("first", "failed")], next_after: "more" }
      if (input.action === "schedule.update") {
        writes.push(input)
        return new Error("This job changed")
      }
      return []
    },
    "/component-tests/nexus-chat.html#/workspaces/one/panels/schedules/parent%2Fjob",
  )
  await page.getByRole("button", { name: "Load more executions" }).click()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  const prompt = page.getByRole("textbox", { name: "Prompt", exact: true })
  await prompt.fill("My unsaved edit")
  delivered = true
  await page.route("**/api/7777/chats/parent", (route) =>
    route.fulfill({
      json: {
        turns: [],
        pending: [],
        decisions: [],
        busy: false,
        problem: null,
        detail: { title: "Delivery parent", version: 1, active: null, runner: null, archived: false, owned: false },
      },
    }),
  )
  await page.clock.fastForward(3000)
  await expect(page.getByRole("button", { name: "Latest execution: completed" })).toBeVisible()
  await expect(page.getByText(/· completed$/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Open execution", exact: true })).toHaveCount(2)
  await expect(prompt).toHaveValue("My unsaved edit")
  await expect(prompt).toBeFocused()
  await page.getByRole("button", { name: "Save job" }).click()
  await expect(page.getByText("This job changed", { exact: true })).toBeVisible()
  expect(writes).toEqual([
    {
      action: "schedule.update",
      workspace: "one",
      conversation: "parent",
      id: "job",
      version: 2,
      prompt: "My unsaved edit",
    },
  ])
  await page.getByRole("button", { name: "Back to conversation" }).click()
  await expect(page).toHaveURL(/\/conversations\/parent$/)
})
