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
