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

test("suggestion shortcuts wrap, reset on input and complete without submitting", async ({ page }) => {
  await page.goto("/component-tests/composer.html?suggestions")
  const editor = page.getByRole("textbox", { name: "Message" })
  const active = page.locator("[data-suggestion-id][data-active]")
  await editor.fill("/")
  await expect(active).toHaveText("/alpha")
  await editor.press("ArrowUp")
  await expect(active).toHaveText("/gamma")
  await editor.press("Control+n")
  await expect(active).toHaveText("/alpha")
  await editor.press("Control+p")
  await expect(active).toHaveText("/gamma")
  await editor.press("ArrowDown")
  await expect(active).toHaveText("/alpha")
  await editor.press("Shift+ArrowDown")
  await expect(active).toHaveText("/beta")
  await editor.fill("/")
  await expect(active).toHaveText("/alpha")
  await editor.dispatchEvent("keydown", { key: "Enter", isComposing: true })
  await expect(editor).toHaveText("/")
  await expect(active).toHaveText("/alpha")
  await editor.press("Tab")
  await expect(editor).toHaveText("/alpha")
  await expect(editor).toBeFocused()
  await expect(active).toHaveCount(0)

  await editor.fill("/no-such-command")
  await expect(page.locator("[data-suggestion-id]")).toHaveCount(0)
  await editor.press("Enter")
  await editor.press("Tab")
  await expect(editor).toBeFocused()
  await expect(editor).toHaveText("/no-such-command")
  await expect(page.locator('[data-component="composer-suggestions"]')).toBeVisible()
  await expect(page.getByLabel("Submissions")).toHaveText("0")
})

test("suggestions retain a hovered row across refresh and recover when it disappears", async ({ page }) => {
  await page.goto("/component-tests/composer.html?suggestions")
  const editor = page.getByRole("textbox", { name: "Message" })
  const active = page.locator("[data-suggestion-id][data-active]")
  await editor.fill("/")
  await page.getByRole("button", { name: "/beta", exact: true }).hover()
  await expect(active).toHaveText("/beta")
  await page.getByRole("button", { name: "Refresh commands" }).click()
  await expect(active).toHaveText("/beta")
  await page.getByRole("button", { name: "Remove beta" }).click()
  await expect(active).toHaveText("/alpha")
  await editor.press("ArrowUp")
  await expect(active).toHaveText("/gamma")
  await editor.press("Enter")
  await expect(editor).toHaveText("/gamma")

  await editor.fill("@")
  await expect(active).toHaveText("@alpha")
  await editor.press("ArrowDown")
  await expect(active).toHaveText("@gamma")
  await editor.press("Tab")
  await expect(editor.locator('[data-mention="skill"]')).toHaveText("@gamma")
  await expect(editor).toBeFocused()
  await expect(page.getByLabel("Submissions")).toHaveText("0")
})

test("command search preserves the draft and dismisses before stopping a run", async ({ page }) => {
  await page.goto("/component-tests/composer.html?suggestions")
  const editor = page.getByRole("textbox", { name: "Message" })
  const search = page.getByRole("textbox", { name: "Commands", exact: true })
  const active = page.locator("[data-suggestion-id][data-active]")
  await editor.fill("existing draft")
  await page.getByRole("button", { name: "Open commands" }).click()
  await expect(search).toBeFocused()
  await search.press("ArrowDown")
  await expect(active).toHaveText("/beta")
  await search.fill("gamma")
  await expect(active).toHaveText("/gamma")
  await search.press("Tab")
  await expect(editor).toHaveText("/gamma existing draft")
  await expect(editor).toBeFocused()
  await expect(search).toHaveCount(0)

  for (const key of ["Escape", "Control+g"]) {
    await page.getByRole("button", { name: "Open commands" }).click()
    await expect(search).toBeFocused()
    await search.press(key)
    await expect(search).toHaveCount(0)
    await expect(editor).toBeFocused()
    await expect(editor).toHaveText("/gamma existing draft")
    await expect(page.getByLabel("Stops")).toHaveText("0")
  }
  await editor.press("Control+g")
  await expect(page.getByLabel("Stops")).toHaveText("1")
  await expect(page.getByLabel("Submissions")).toHaveText("0")
})

test("keyboard completion excludes previous file results while the next search is pending", async ({ page }) => {
  const search = Promise.withResolvers<void>()
  await page.route("**/component-tests/files?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("query")
    if (query === "new") await search.promise
    await route.fulfill({ json: [`${query}.ts`] })
  })
  await page.goto("/component-tests/composer.html?suggestions")
  const editor = page.getByRole("textbox", { name: "Message" })
  const active = page.locator("[data-suggestion-id][data-active]")
  await editor.fill("@old")
  await expect(active).toHaveText("old.ts")
  await editor.fill("@new")
  await expect(page.locator("[data-suggestion-id]")).toHaveCount(0)
  await editor.press("Enter")
  await expect(editor).toHaveText("@new")
  await expect(editor.locator('[data-mention="file"]')).toHaveCount(0)
  search.resolve()
  await expect(active).toHaveText("new.ts")
  await editor.press("Enter")
  await expect(editor.locator('[data-mention="file"]')).toHaveText("@new.ts")
  await expect(page.getByLabel("Submissions")).toHaveText("0")
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
