import { expect, test, type Page } from "@playwright/test"
import config from "../src/new-session/agent-default-config.json" with { type: "json" }
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

function savedTab(page: Page) {
  return page.evaluate(() => ({
    id: localStorage.getItem("opencode.7777.session.id"),
    directory: localStorage.getItem("opencode.7777.session.directory"),
    draft: JSON.parse(localStorage.getItem("opencode.7777.prompt.draft") ?? "null"),
  }))
}

test("a failed saved-session lookup keeps the tab draft through Retry", async ({ page }) => {
  const { writes, errors, sessions } = await setupSession(page, undefined, [
    { id: "first", type: "user", text: "Original conversation", time: { created: 1 } },
  ])
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Keep my work")
  await page.locator('input[type="file"]').setInputFiles({
    name: "work.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("saved"),
  })
  const attachment = page.getByText("work.txt", { exact: true })
  await expect(attachment).toBeVisible()
  const saved = await savedTab(page)
  expect(saved).toMatchObject({
    id: "ses_0",
    directory: sessions[0].location.directory,
    draft: {
      prompt: "Keep my work",
      attachments: [{ filename: "work.txt", url: "data:text/plain;base64,c2F2ZWQ=" }],
    },
  })
  let reads = 0
  await page.route("**/api/session/ses_0", (route) => {
    reads++
    if (reads === 1) return route.fulfill({ status: 500 })
    if (reads === 2)
      return route.fulfill({
        status: 404,
        json: { _tag: "SessionNotFoundError", sessionID: "ses_other", message: "Other session missing" },
      })
    if (reads === 3) return route.fulfill({ json: { data: sessions[1] } })
    return route.fallback()
  })
  await page.reload()
  const retry = page.getByRole("button", { name: "Retry", exact: true })
  const suggestion = page.getByRole("button", { name: config.suggestedQuestions[0] })
  for (const message of ["UnexpectedStatus: 500", "Other session missing", "Request failed"]) {
    await expect(page.getByText(message, { exact: true })).toBeVisible()
    await expect(suggestion).toBeDisabled()
    expect(await savedTab(page)).toEqual(saved)
    await retry.click()
  }
  await expect(page.getByText("Original conversation", { exact: true })).toBeVisible()
  await expect(editor).toHaveText("Keep my work")
  await expect(attachment).toBeVisible()
  await expect(retry).toHaveCount(0)
  expect(reads).toBe(4)
  expect(await savedTab(page)).toEqual(saved)
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test("a confirmed missing session opens a local draft in its saved directory", async ({ page }) => {
  const { writes, errors, sessions } = await setupSession(page)
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Unsent question")
  await page.route("**/api/session/ses_0", (route) =>
    route.fulfill({
      status: 404,
      json: { _tag: "SessionNotFoundError", sessionID: "ses_0", message: "Session not found" },
    }),
  )
  await page.reload()
  await expect(page.getByRole("button", { name: config.suggestedQuestions[0] })).toBeEnabled()
  await expect(editor).toHaveText("Unsent question")
  await expect(page.getByRole("button", { name: "Jump to message (0/9)" })).toBeDisabled()
  expect(await savedTab(page)).toEqual({
    id: null,
    directory: sessions[0].location.directory,
    draft: { prompt: "Unsent question", attachments: [] },
  })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
