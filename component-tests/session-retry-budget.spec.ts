import type { SessionMessageInfo } from "@opencode/client/promise"
import { expect, test, type Page } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

async function mockModelCatalog(page: Page, location: { directory: string }) {
  const models = ["Start", "Alternate"].map((name) => ({
    id: name.toLowerCase(),
    modelID: name.toLowerCase(),
    name,
    providerID: "opencode",
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    variants: [],
    time: { released: 1 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 100000, output: 10000 },
  }))
  await page.route(/\/api\/model\?/, (route) => route.fulfill({ json: { location, data: models } }))
  await page.route(/\/api\/model\/default\?/, (route) => route.fulfill({ json: { location, data: models[0] } }))
  await page.route(/\/api\/provider\?/, (route) =>
    route.fulfill({ json: { location, data: [{ id: "opencode", name: "OpenCode", package: "opencode" }] } }),
  )
}

for (const recovery of ["same page", "reload", "delivered on reload"]) {
  test(`Send recovers a lost acknowledgement on ${recovery}`, async ({ page }) => {
    const { errors } = await setupSession(page)
    const ids: string[] = []
    const delivered = new Map<string, SessionMessageInfo>()
    let visible = false
    await page.route("**/api/session/ses_0/agent", (route) => route.fulfill({ status: 204 }))
    await page.route("**/api/session/ses_0/message?**", (route) =>
      route.fulfill({ json: { data: visible ? [...delivered.values()] : [], cursor: {} } }),
    )
    await page.route("**/api/session/ses_0/prompt", (route) => {
      const { id, text, delivery } = route.request().postDataJSON()
      ids.push(id)
      if (!delivered.has(id)) delivered.set(id, { id, type: "user", text, time: { created: 1 } })
      if (ids.length === 1) return route.abort("failed")
      visible = true
      // opencode2 returns the original receipt even when the message is already delivered.
      return route.fulfill({
        json: { data: { id, sessionID: "ses_0", delivery, type: "user", payload: { text }, time: { created: 1 } } },
      })
    })
    const editor = page.getByRole("textbox", { name: "Message", exact: true })
    const send = page.getByRole("button", { name: "Send", exact: true })
    const timeline = page.locator('[data-slot="session-message-timeline"]')
    const text = "Send this once"
    await editor.fill(text)
    await send.click()
    await expect.poll(() => ids.length).toBe(1)
    await expect(editor).toHaveText(text)
    if (recovery !== "same page") {
      visible = recovery === "delivered on reload"
      await page.reload()
      await expect(editor).toHaveText(text)
      if (visible) await expect(timeline.getByText(text, { exact: true })).toBeVisible()
    }
    expect(ids).toHaveLength(1)
    await send.click()
    await expect(editor).toHaveText("")
    await expect(timeline.getByText(text, { exact: true })).toHaveCount(1)
    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem("opencode.7777.prompt.history") ?? "{}").entries?.length),
      )
      .toBe(1)
    expect(ids).toEqual(recovery === "delivered on reload" ? [ids[0]] : [ids[0], ids[0]])
    expect(delivered.size).toBe(1)
    expect(errors).toEqual([])
  })
}

test("both budget notices open the mounted model picker for an eligible root session", async ({ page }) => {
  const history: SessionMessageInfo[] = ["provider.budget-limit", "provider.model-budget-limit"].flatMap((type, i) => [
    { id: `msg_${i}a`, type: "user", text: `Prompt ${i}`, time: { created: 1 + i * 3 } },
    {
      id: `msg_${i}b`,
      type: "assistant",
      agent: "7777",
      model: { id: "start", providerID: "opencode" },
      content: [],
      finish: "error",
      error: { type, message: "Budget reached.", status: 429 },
      time: { created: 2 + i * 3, completed: 3 + i * 3 },
    },
    { id: `msg_${i}c`, type: "idle", outcome: "succeeded", time: { created: 3 + i * 3 } },
  ])
  const { errors, sessions, writes } = await setupSession(page, undefined, history)
  const free = page.getByRole("button", { name: "Use a free model" })
  const change = page.getByRole("button", { name: "Switch model" })
  const trigger = page.getByRole("button", { name: "Model", exact: true })
  await expect(page.getByText(/Workspace budget reached/)).toBeVisible()
  await expect(trigger).toBeDisabled()
  await expect(free).toHaveCount(0)
  const location = sessions[0].location
  await mockModelCatalog(page, location)
  await page.reload()
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Keep my draft")
  await free.click()
  const search = page.getByRole("combobox", { name: "Search models" })
  await expect(search).toBeFocused()
  await search.press("Escape")
  await expect(editor).toBeFocused()
  await change.click()
  await search.fill("Alternate")
  await search.press("Enter")
  await expect(trigger).toContainText("Alternate")
  await expect(editor).toBeFocused()
  await expect(editor).toHaveText("Keep my draft")
  await expect(page.locator("header")).toContainText("2/9")
  Object.assign(sessions[0], { parentID: "ses_parent" })
  await page.reload()
  await expect(page.getByText(/Workspace budget reached/)).toBeVisible()
  await expect(trigger).toBeEnabled()
  await expect(free).toHaveCount(0)
  await expect(change).toHaveCount(0)
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test("an immediate retry after reload uses the failed prompt's model while the catalog is loading", async ({
  page,
}) => {
  const { sessions, errors } = await setupSession(page)
  await mockModelCatalog(page, sessions[0].location)
  await page.reload()
  const trigger = page.getByRole("button", { name: "Model", exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const search = page.getByRole("combobox", { name: "Search models" })
  await search.fill("Alternate")
  await search.press("Enter")
  await expect(trigger).toContainText("Alternate")
  const attempts: { id: string; metadata: { model?: { modelID: string } } }[] = []
  await page.route(/\/api\/session\/ses_0\/(agent|model)$/, (route) => route.fulfill({ status: 204 }))
  await page.route("**/api/session/ses_0/prompt", (route) => {
    const request = route.request().postDataJSON()
    attempts.push(request)
    if (attempts.length === 1) return route.abort("failed")
    return route.fulfill({
      json: {
        data: {
          id: request.id,
          sessionID: "ses_0",
          delivery: request.delivery,
          type: "user",
          payload: { text: request.text },
          time: { created: 1 },
        },
      },
    })
  })
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const send = page.getByRole("button", { name: "Send", exact: true })
  await editor.fill("Resend with Alternate")
  await send.click()
  await expect.poll(() => attempts.length).toBe(1)
  await expect(editor).toHaveText("Resend with Alternate")
  const release = Promise.withResolvers<void>()
  await page.route(/\/api\/model\/default\?/, async (route) => {
    await release.promise
    await route.fallback()
  })
  try {
    await page.reload()
    await expect(editor).toHaveText("Resend with Alternate")
    await send.click()
    await expect.poll(() => attempts.length).toBe(2)
    expect(attempts[0].metadata.model?.modelID).toBe("alternate")
    expect(attempts[1]).toEqual(attempts[0])
    expect(errors).toEqual([])
  } finally {
    release.resolve()
  }
})
