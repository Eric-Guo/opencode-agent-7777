import { readFile } from "node:fs/promises"
import { expect, test, type Page } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

async function expectDownload(page: Page, activate: () => Promise<void>, filename: string, bytes: Buffer) {
  const [download] = await Promise.all([page.waitForEvent("download"), activate()])
  expect(download.suggestedFilename()).toBe(filename)
  expect(await readFile((await download.path())!)).toEqual(bytes)
}

test("a card-only prompt shows quotes and notes in their original order", async ({ page }) => {
  const { errors } = await setupSession(page, undefined, [
    {
      id: "cards",
      type: "user",
      text: "The underlying prompt sent to the model",
      metadata: {
        displayText: "",
        comments: [
          { type: "quote", text: "An earlier answer" },
          {
            type: "quote",
            text: "Build completed",
            source: { label: "Terminal", icon: "terminal", subject: "the terminal" },
          },
          {
            type: "note",
            origin: "browser",
            subject: "the save button",
            label: "Button",
            title: "Save",
            subtitle: "Preferences",
            icon: "select-element",
            comment: "",
          },
          { type: "quote", text: false },
          {
            type: "browser",
            tabID: "tab_1",
            url: "https://example.org",
            element: { label: "Toolbar", selector: "#tools" },
            comment: "Move this toolbar",
          },
        ],
      },
      time: { created: 1 },
    },
  ])
  const cards = page.locator('[data-slot="user-message-comments"]')
  await expect(cards.locator('[data-slot="attachment-card-title"]')).toHaveText([
    "An earlier answer",
    "Build completed",
    "Save",
    "Move this toolbar",
  ])
  for (const label of ["Terminal", "Preferences", "Toolbar"])
    await expect(cards.getByText(label, { exact: true })).toBeVisible()
  await expect(page.getByText("The underlying prompt sent to the model", { exact: true })).toBeHidden()
  await expect(page.locator('[data-slot="session-header"]')).toContainText("1/9")
  expect(errors).toEqual([])
})

test("server-file references render beside inline files with their paths on hover", async ({ page }) => {
  const reads: string[] = []
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith("/api/fs/read/") || path.endsWith("/report.csv")) reads.push(path)
  })
  const { errors } = await setupSession(page, undefined, [
    {
      id: "files",
      type: "user",
      text: "Model prompt with the server path",
      metadata: {
        displayText: "Review the files",
        comments: [{ path: "src/task.ts", comment: "Check the total" }],
        attachments: [
          { name: "incomplete.csv", mime: "text/csv" },
          { name: "report.csv", mime: "text/csv", path: "/workspace/report.csv" },
        ],
      },
      files: [{ name: "inline.txt", mime: "text/plain", source: { type: "inline" }, data: "aGk=" }],
      time: { created: 1 },
    },
    {
      id: "legacy",
      type: "user",
      text: "The user made the following comment regarding line 3 of src/older.ts: Old file comment",
      time: { created: 2 },
    },
  ])
  const files = page.locator('[data-slot="user-message-attachments"]')
  await expect(files.locator('[data-slot="attachment-card-title"]')).toHaveText(["report.csv", "inline.txt"])
  const reference = files.locator('[data-component="attachment-card"]').filter({ hasText: "report.csv" })
  await reference.hover()
  await expect(reference).toHaveAttribute("title", "/workspace/report.csv")
  await expect(files.getByRole("button", { name: /report\.csv/ })).toHaveCount(0)
  await expect(page.getByText("Review the files", { exact: true })).toBeVisible()
  await expect(page.getByText("Check the total", { exact: true })).toBeVisible()
  await expect(page.getByText("Old file comment", { exact: true })).toBeVisible()
  expect(reads).toEqual([])
  expect(errors).toEqual([])
})

test("a revoked blob URL only affects the card without saved bytes", async ({ page }) => {
  const { errors } = await setupSession(page)
  let uri: string
  await page.route("**/api/session/ses_0/message?**", async (route) => {
    uri ??= await page.evaluate(() => URL.createObjectURL(new Blob(["local"])))
    const source = { type: "uri", uri }
    const row = {
      id: "local-files",
      type: "user",
      text: "Two files",
      files: [
        { name: "/workspace/local.txt", mime: "text/plain", source, data: "" },
        { name: "/workspace/saved.txt", mime: "text/plain", source, data: "aGk=" },
      ],
      time: { created: 1 },
    }
    await route.fulfill({ json: { data: [row], cursor: {} } })
  })
  await page.reload()
  const files = page.locator('[data-slot="user-message-attachments"]')
  const local = files.getByRole("button", { name: /local\.txt/ })
  await expectDownload(page, () => local.click(), "local.txt", Buffer.from("local"))
  await page.evaluate((uri) => URL.revokeObjectURL(uri), uri!)
  await local.click()
  await expect(page.getByText("Could not open file", { exact: true })).toBeVisible()
  const saved = files.getByRole("button", { name: /saved\.txt/ })
  await expectDownload(page, () => saved.click(), "saved.txt", Buffer.from("hi"))
  expect(errors).toEqual([])
})

test("transcript file cards download the saved bytes and image cards open the preview", async ({ page }) => {
  const bytes = Buffer.from([0, 255, 195, 169, 10])
  const { errors } = await setupSession(page, undefined, [
    {
      id: "attachments",
      type: "user",
      text: "Review these attachments",
      files: [
        {
          name: "C:\\Work\\report.bin",
          mime: "application/octet-stream",
          source: { type: "inline" },
          data: bytes.toString("base64"),
        },
        { mime: "application/octet-stream", source: { type: "inline" }, data: "" },
        {
          name: "pixel.png",
          mime: "image/png",
          source: { type: "inline" },
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+ioAAAAASUVORK5CYII=",
        },
      ],
      time: { created: 1 },
    },
  ])
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Keep this draft")
  const files = page.locator('[data-slot="user-message-attachments"]')
  const binary = files.getByRole("button", { name: /report\.bin/ })
  await expect(binary).toBeVisible()
  const reads: string[] = []
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith("/api/fs/read/") || path.startsWith("/api/experimental/media/")) reads.push(path)
  })
  await expectDownload(page, () => binary.click(), "report.bin", bytes)
  const unnamed = files.getByRole("button", { name: /attachment/i })
  await expectDownload(page, () => unnamed.press("Enter"), "attachment", Buffer.alloc(0))
  await files.getByRole("img", { name: "pixel.png" }).click()
  const preview = page.getByRole("dialog")
  await expect(preview.getByRole("img", { name: "pixel.png" })).toBeVisible()
  await preview.getByRole("button", { name: "Close" }).click()
  await expect(preview).toBeHidden()
  await expect(editor).toHaveText("Keep this draft")
  await expect(page.locator('[data-slot="session-header"]')).toContainText("1/9")
  expect(reads).toEqual([])
  expect(errors).toEqual([])
})

test("a just-sent file downloads its local bytes while the prompt awaits a receipt", async ({ page }) => {
  const { errors } = await setupSession(page)
  const release = Promise.withResolvers<void>()
  await page.route("**/api/session/ses_0/agent", (route) => route.fulfill({ status: 204 }))
  await page.route("**/api/session/ses_0/prompt", async (route) => {
    const { id, text, delivery } = route.request().postDataJSON()
    await release.promise
    await route.fulfill({
      json: { data: { id, type: "user", sessionID: "ses_0", payload: { text }, delivery, time: { created: 1 } } },
    })
  })
  const bytes = Buffer.from("notes 📝\n")
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: 'text/plain;profile="a,b"',
    buffer: bytes,
  })
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Send with notes")
  const sending = page.waitForRequest("**/api/session/ses_0/prompt")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await sending
  try {
    const file = page.locator('[data-slot="user-message-attachments"]').getByRole("button", { name: /notes\.txt/ })
    await expect(file).toBeVisible()
    await expectDownload(page, () => file.press("Space"), "notes.txt", bytes)
  } finally {
    release.resolve()
  }
  expect(errors).toEqual([])
})
