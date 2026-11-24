import { expect, test, type Page } from "@playwright/test"
import type { ChatTurn, Snapshot } from "../src/nexus/chat"
import { mockEvents } from "./session.fixture"

const conversationURL = "/component-tests/nexus-chat.html#/workspaces/shared/conversations/chat"

function turn(index: number, prompt: string): ChatTurn {
  return {
    id: `turn["${index}"]`,
    input: `input-${index}`,
    variant: null,
    run: null,
    created: index + 1,
    position: index + 1,
    prompt,
    text: "Answer paragraph\n\n".repeat(8),
    status: "completed",
  }
}

async function setup(page: Page, history: Pick<Snapshot, "turns" | "pending">) {
  await mockEvents(page)
  const errors: string[] = []
  const writes: string[] = []
  const historyReads: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/api/7777/**", (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith("/history")) historyReads.push(path)
    if (path.endsWith("/manage")) {
      const { action } = request.postDataJSON()
      if (action === "workspace.list") return route.fulfill({ json: { items: [] } })
      if (action === "extension.list") return route.fulfill({ json: [] })
    }
    if (request.method() !== "GET") writes.push(path)
    if (path.endsWith("/connection"))
      return route.fulfill({
        json: { scope: '["nexus","fixture","shared"]', user: "Human", agent: "OpenCode", workspace: "Shared" },
      })
    if (path.endsWith("/choices")) return route.fulfill({ json: { models: [], runners: [], approvals: ["ask"] } })
    const selected = path.endsWith("/chats/chat")
    return route.fulfill({
      json: {
        ...(selected ? history : { turns: [], pending: [] }),
        busy: false,
        decisions: [],
        problem: null,
        hasOlder: false,
        detail: { title: selected ? "Shared" : "Second", owned: false, archived: false, writable: true },
      },
    })
  })
  await page.goto(conversationURL)
  return { errors, writes, historyReads }
}

test("jump searches the nine visible dialogs and holds the selected prompt in view", async ({ page }) => {
  const { errors, writes, historyReads } = await setup(page, {
    turns: Array.from({ length: 11 }, (_, index) => turn(index, `Prompt ${index}`)),
    pending: [],
  })
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const counter = page.getByRole("button", { name: "Jump to message (9/9)" })
  const dialog = page.getByRole("dialog", { name: "Jump to message" })
  const search = dialog.getByRole("combobox")
  const target = page.locator('[data-timeline-row="UserMessage"]').filter({ hasText: "Prompt 2" })
  const latest = page.getByRole("button", { name: "Jump to latest" })
  await expect(counter).toHaveText("9/9")

  await editor.fill("Keep this draft")
  await counter.click()
  await expect(search).toBeFocused()
  await expect(dialog.getByRole("option")).toHaveText(Array.from({ length: 9 }, (_, index) => `Prompt ${10 - index}`))
  await search.fill("Prompt 1")
  await expect(dialog.getByRole("option")).toHaveText(["Prompt 10"])
  await search.press("Escape")
  await expect(counter).toBeFocused()
  await expect(target).not.toBeInViewport()

  await counter.press("Enter")
  await search.fill("PROMPT 2")
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

test("jump searches multiline prompts, excludes queued inputs and closes when the conversation changes", async ({
  page,
}) => {
  const { errors, writes } = await setup(page, {
    turns: [turn(0, "Discussion notes. ".repeat(30) + "Find the\nledger for Friday")],
    pending: [{ id: "queued", text: "Queued question", created: 2 }],
  })
  await page.evaluate(() => {
    const current = location.hash
    history.replaceState(null, "", "#/workspaces/shared/conversations/second")
    history.pushState(null, "", current)
  })
  await page.getByRole("button", { name: "Jump to message (2/9)" }).click()
  const dialog = page.getByRole("dialog", { name: "Jump to message" })
  const search = dialog.getByRole("combobox")
  await expect(dialog.getByRole("option")).toHaveCount(1)
  await search.fill("queued question")
  await expect(dialog.getByText("No matching prompts")).toBeVisible()
  await search.fill("THE LEDGER")
  await expect(dialog.getByRole("option")).toHaveText(/^….*Find the ledger for Friday$/)
  await page.goBack()
  await expect(page.getByRole("heading", { name: "Second" })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Jump to message (0/9)" })).toBeDisabled()
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
