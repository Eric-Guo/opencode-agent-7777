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
  await page.goto("/component-tests/nexus-chat.html")
  await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue("one")
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
