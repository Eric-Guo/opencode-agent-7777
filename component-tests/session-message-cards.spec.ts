import { expect, test } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

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
  await expect(page.getByText("Review the files", { exact: true })).toBeVisible()
  await expect(page.getByText("Check the total", { exact: true })).toBeVisible()
  await expect(page.getByText("Old file comment", { exact: true })).toBeVisible()
  expect(reads).toEqual([])
  expect(errors).toEqual([])
})
