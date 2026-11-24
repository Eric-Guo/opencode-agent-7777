import type { SessionMessageInfo } from "@opencode/client/promise"
import { expect, test } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

test("jump searches the nine visible dialogs and holds the selected prompt in view", async ({ page }) => {
  const history: SessionMessageInfo[] = []
  for (let index = 0; index < 11; index++) {
    history.push(
      {
        type: "user",
        id: `prompt["${index}"]`,
        text: index === 2 ? "Private model context" : `Prompt ${index}`,
        metadata: index === 2 ? { displayText: "Displayed question", comments: [] } : undefined,
        time: { created: index * 2 },
      },
      {
        type: "assistant",
        id: `answer-${index}`,
        agent: "7777",
        model: { id: "fixture", providerID: "fixture" },
        content: [{ type: "text", text: "Answer paragraph\n\n".repeat(8) }],
        time: { created: index * 2 + 1, completed: index * 2 + 1 },
      },
    )
  }
  const { errors, writes } = await setupSession(page, undefined, history)
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const counter = page.getByRole("button", { name: /Jump to message/ })
  const dialog = page.getByRole("dialog", { name: "Jump to message" })
  const search = dialog.getByRole("combobox")
  const target = page.locator('[data-timeline-row="UserMessage"]').filter({ hasText: "Displayed question" })
  const latest = page.getByRole("button", { name: "Jump to latest" })
  const historyReads: string[] = []
  await expect(page.locator("header")).toContainText("9/9")
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/message")) historyReads.push(request.url())
  })

  await editor.fill("Keep this draft")
  await counter.click()
  await expect(search).toBeFocused()
  await expect(dialog.getByRole("option")).toHaveText([
    "Prompt 10",
    "Prompt 9",
    "Prompt 8",
    "Prompt 7",
    "Prompt 6",
    "Prompt 5",
    "Prompt 4",
    "Prompt 3",
    "Displayed question",
  ])
  await search.fill("private model context")
  await expect(dialog.getByText("No matching prompts")).toBeVisible()
  await search.press("Escape")
  await expect(counter).toBeFocused()
  await expect(target).not.toBeInViewport()

  await counter.press("Enter")
  await search.fill("DISPLAYED")
  await search.press("Enter")
  await expect(dialog).toHaveCount(0)
  await expect(target).toBeInViewport({ ratio: 1 })
  await expect(page.locator('[data-slot="session-message-scroller"] [data-scrollable]').first()).toBeFocused()
  await page.setViewportSize({ width: 1100, height: 600 })
  await expect(target).toBeInViewport({ ratio: 1 })
  await expect(latest).toBeVisible()
  await expect(editor).toHaveText("Keep this draft")
  await latest.click()
  await expect(latest).toBeHidden()
  await expect(target).not.toBeInViewport()
  expect(historyReads).toEqual([])
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test("jump reveals a match deep in a multiline prompt and closes when the session changes", async ({ page }) => {
  const { emitEvents, errors, writes } = await setupSession(
    page,
    [{ type: "session.deleted", data: { sessionID: "ses_0" } }],
    [
      {
        type: "user",
        id: "long",
        text: "Discussion notes. ".repeat(30) + "Find the\nledger for Friday",
        time: { created: 1 },
      },
    ],
  )
  await page.getByRole("button", { name: /Jump to message/ }).click()
  const dialog = page.getByRole("dialog", { name: "Jump to message" })
  await dialog.getByRole("combobox").fill("THE LEDGER")
  await expect(dialog.getByRole("option")).toHaveText(/^….*Find the ledger for Friday$/)
  emitEvents()
  await expect(page.getByRole("button", { name: "Options for Second" })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Jump to message (0/9)" })).toBeDisabled()
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test("jump finds matching card excerpts once per prompt without reading history or files", async ({ page }) => {
  const { errors, writes } = await setupSession(page, undefined, [
    {
      type: "user",
      id: "mixed",
      time: { created: 1 },
      text: "Private server instructions",
      files: [{ name: "inline-ledger.txt", mime: "text/plain", source: { type: "inline" }, data: "aGk=" }],
      metadata: {
        displayText: "Review both files",
        comments: [{ path: "src/totals.ts", comment: "Verify the balance" }],
        attachments: [
          { name: "archived-ledger.csv", path: "/private/reference.csv", mime: "text/csv" },
          { name: "invalid.csv", mime: "text/csv" },
        ],
      },
    },
    {
      type: "user",
      id: "cards",
      time: { created: 2 },
      text: "Private card instructions",
      metadata: {
        displayText: "",
        comments: [
          { type: "quote", text: "Read the\nquarterly statement", comment: "Check the sum" },
          {
            type: "note",
            title: "Save preferences",
            subtitle: "Settings panel",
            label: "Button",
            icon: "select-element",
            comment: "",
          },
          {
            type: "browser",
            element: { selector: "#hidden-selector", label: "Legacy toolbar" },
            comment: "Move the toolbar",
          },
          { type: "quote", text: 42, comment: "Invalid quote" },
        ],
      },
    },
    {
      type: "user",
      id: "incomplete",
      time: { created: 3 },
      text: "Private envelope instructions",
      metadata: { displayText: "Public preview", comments: false },
    },
  ])
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Keep this draft")
  const reads: string[] = []
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (path.endsWith("/message") || path.startsWith("/api/fs/")) reads.push(path)
  })
  await page.getByRole("button", { name: "Jump to message (3/9)" }).click()
  const dialog = page.getByRole("dialog", { name: "Jump to message" })
  const search = dialog.getByRole("combobox")
  const options = dialog.getByRole("option")
  await expect(options).toHaveCount(3)
  for (const [query, excerpt] of [
    ["LEDGER", "archived-ledger.csv"],
    ["inline-ledger", "inline-ledger.txt"],
    ["balance", "Verify the balance"],
    ["totals.ts", "totals.ts"],
    ["sum", "Check the sum"],
    ["PREFERENCES", "Save preferences"],
    ["settings", "Settings panel"],
    ["legacy", "Legacy toolbar"],
    ["move the", "Move the toolbar"],
  ]) {
    await search.fill(query)
    await expect(options).toHaveText([excerpt])
  }
  for (const hidden of ["private", "invalid", "hidden-selector"]) {
    await search.fill(hidden)
    await expect(dialog.getByText("No matching prompts")).toBeVisible()
  }
  await search.fill("")
  await expect(options).toHaveText(["Public preview", "cards", "Review both files"])
  await search.fill("quarterly   statement")
  await expect(options).toHaveText(["Read the quarterly statement"])
  await search.press("Enter")
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-timeline-row="UserMessage"][data-message-id="cards"]')).toBeInViewport()
  await expect(page.locator('[data-slot="session-message-scroller"] [data-scrollable]').first()).toBeFocused()
  await page.getByRole("button", { name: "Add images and files" }).click()
  await page.getByRole("menuitem", { name: /Commands/ }).click()
  await page.getByRole("button", { name: /^\/fork / }).click()
  const fork = page.getByRole("dialog", { name: "Fork from message" })
  await fork.getByRole("combobox").fill("archived-ledger")
  await expect(fork.getByText("No messages found")).toBeVisible()
  await fork.getByRole("combobox").press("Escape")
  await expect(editor).toHaveText("Keep this draft")
  expect(reads).toEqual([])
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
