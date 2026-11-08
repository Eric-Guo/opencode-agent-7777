import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/component-tests/composer.html")
})

test("attachment-only updates retain the caret and native undo/redo", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Message" })
  await editor.click()
  await page.keyboard.insertText("hello")
  await editor.press("ArrowLeft")
  await editor.press("ArrowLeft")
  await page.getByRole("button", { name: "Add example attachment" }).click()
  await expect(page.getByLabel("Attachments")).toHaveText("1")
  await expect(editor).toBeFocused()
  expect(await editor.evaluate(() => window.getSelection()?.anchorOffset)).toBe(3)

  await editor.press("ControlOrMeta+z")
  await expect(page.getByLabel("Draft text")).toHaveText("")
  await expect(page.getByLabel("Attachments")).toHaveText("1")
  await editor.press("ControlOrMeta+Shift+z")
  await expect(editor).toHaveText("hello")
  await expect(page.getByLabel("Draft text")).toHaveText("hello")
})

test("in-place store updates still render after typing", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Message" })
  await editor.pressSequentially("hello")
  await page.getByRole("button", { name: "Update text in place" }).click()
  await expect(page.getByLabel("Draft text")).toHaveText("External update")
  await expect(editor).toHaveText("External update")
})

test("blank local lines survive the input echo but an explicit clear removes them", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Message" })
  await editor.press("Shift+Enter")
  await expect.poll(() => editor.innerHTML()).not.toBe("")
  await expect(page.getByLabel("Draft text")).toHaveText("")
  await editor.pressSequentially("next line")
  expect(await page.getByLabel("Draft text").textContent()).toBe("\nnext line")
  await page.getByRole("button", { name: "Clear draft" }).click()
  await expect(editor).toHaveText("")
  await expect.poll(() => editor.innerHTML()).toBe("")
  await editor.press("Shift+Enter")
  await expect.poll(() => editor.innerHTML()).not.toBe("")
  await page.getByRole("button", { name: "Clear draft" }).click()
  await expect.poll(() => editor.innerHTML()).toBe("")
})

test("catalog loading and failures leave the composer usable and suggestions recover on retry", async ({ page }) => {
  const command = Promise.withResolvers<void>()
  let attempts = 0
  await page.route("**/component-tests/api/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith("/command") && ++attempts === 1) {
      await command.promise
      await route.fulfill({ status: 503, body: "Unavailable" })
      return
    }
    await route.fulfill({
      json: {
        location: { directory: "/fixture" },
        data: url.pathname.endsWith("/command")
          ? [{ name: "review", description: "Review code" }]
          : url.pathname.endsWith("/skill")
            ? [{ id: "review", name: "Review", path: "/skills/review", content: "Review code" }]
            : [],
      },
    })
  })
  await page.goto("/component-tests/composer.html?catalog")
  const editor = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByLabel("Command status")).toHaveText("loading")
  await expect(page.getByLabel("Skill status")).toHaveText("ready")
  await editor.pressSequentially("Keep this draft")
  command.resolve()
  await expect(page.getByLabel("Command status")).toHaveText("failed")
  await expect(editor).toHaveText("Keep this draft")
  await expect(page.getByText("Loading composer fixture")).toHaveCount(0)

  await editor.fill("@review")
  await page.getByRole("button", { name: "@review", exact: true }).click()
  await expect(editor.locator('[data-mention="skill"]')).toHaveText("@review")
  await page.getByRole("button", { name: "Reload catalogs" }).click()
  await expect(page.getByLabel("Command status")).toHaveText("ready")
  await expect(editor.locator('[data-mention="skill"]')).toHaveText("@review")
  await editor.fill("/rev")
  await page.getByRole("button", { name: "/review Review code", exact: true }).click()
  await expect(page.getByLabel("Draft text")).toHaveText("/review")
})
