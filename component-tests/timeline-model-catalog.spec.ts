import type { ModelInfo, SessionMessageInfo } from "@opencode/client/promise"
import { expect, test } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

test("timeline model names and speed notices follow the active session's catalog", async ({ page }) => {
  const standard = { providerID: "fixture", id: "catalog-model" }
  const fast = { ...standard, id: "catalog-model-fast" }
  const history: SessionMessageInfo[] = [
    { id: "m1", type: "user", text: "Compare models", time: { created: 1 } },
    {
      id: "m2",
      type: "assistant",
      agent: "7777",
      model: { ...standard, variant: "high" },
      content: [{ type: "text", text: "Finished" }],
      time: { created: 2, completed: 3 },
    },
    { id: "m3", type: "idle", outcome: "succeeded", time: { created: 4 } },
    { id: "m4", type: "model-switched", model: standard, time: { created: 5 } },
    { id: "m5", type: "model-switched", previous: standard, model: fast, time: { created: 6 } },
    { id: "m6", type: "model-switched", previous: fast, model: standard, time: { created: 7 } },
    { id: "m7", type: "model-switched", model: { ...standard, id: "unlisted-model" }, time: { created: 8 } },
  ]
  const [{ errors }] = await Promise.all([
    setupSession(page, undefined, history),
    page.waitForResponse(/\/api\/model\?/),
    page.waitForResponse(/\/api\/provider\?/),
  ])
  const timeline = page.locator('[data-slot="session-message-timeline"]')
  const footer = timeline.locator('[data-slot="text-part-meta"]')
  await expect(footer).toContainText(standard.id)

  const model: ModelInfo = {
    ...standard,
    modelID: "underlying-api-id",
    name: "Catalog Model",
    capabilities: { input: ["text"], output: ["text"], tools: true },
    variants: [],
    time: { released: 0 },
    cost: [],
    limit: { context: 1000, output: 100 },
    status: "active",
    enabled: true,
  }
  const location = { directory: "c:/work/agent/" }
  const reads: string[] = []
  const release = Promise.withResolvers<void>()
  const catalogRoute = /\/api\/(model|provider)\?/
  await page.route(catalogRoute, async (route) => {
    const path = new URL(route.request().url()).pathname
    reads.push(path)
    if (path === "/api/provider") {
      const provider = { id: "fixture", name: "Fixture", package: "fixture", activation: "auto" }
      return route.fulfill({ json: { location, data: [provider] } })
    }
    await release.promise
    const speed = { base: standard.id, id: "Fast", faster: true }
    return route.fulfill({
      json: { location, data: [model, { ...model, ...fast, name: "Catalog Fast", experimental: { speed } }] },
    })
  })
  await page.route("**/api/session/ses_1/message?*", (route) =>
    route.fulfill({ json: { data: history.toReversed(), cursor: {} } }),
  )
  await page.getByRole("button", { name: "Recent sessions" }).click()
  await page.getByRole("option", { name: /Second/ }).click()
  await expect(page.getByRole("button", { name: "Options for Second" })).toBeVisible()
  await expect(footer).toContainText(standard.id)
  await expect(timeline.getByText("Switched to catalog-model-fast", { exact: true })).toBeVisible()
  release.resolve()
  await expect(footer).toContainText("Catalog Model")
  await expect(footer).toContainText("High")
  for (const label of [
    "Switched to Catalog Model",
    "Switched speed to Fast",
    "Switched speed to Standard",
    "Switched to unlisted-model",
  ]) {
    await expect(timeline.getByText(label, { exact: true })).toBeVisible()
  }
  expect(reads.sort()).toEqual(["/api/model", "/api/provider"])
  await page.unroute(catalogRoute)
  await page.getByRole("button", { name: "Recent sessions" }).click()
  await page.getByRole("option", { name: /First/ }).click()
  await expect(page.getByRole("button", { name: "Options for First" })).toBeVisible()
  await expect(footer).toContainText(standard.id)
  await expect(timeline.getByText("Switched to catalog-model-fast", { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
