import { expect, test } from "@playwright/test"
import config from "../src/new-session/agent-default-config.json" with { type: "json" }
import { mockEvents } from "./session.fixture"

test("reconnecting after failed conversation reads preserves the selected chat and its draft", async ({ page }) => {
  await mockEvents(page)
  const writes: string[] = []
  let failure: { status: number; error: string } | undefined
  await page.route("**/api/7777/**", (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith("/connection"))
      return route.fulfill({
        json: { scope: '["nexus","fixture","shared"]', user: "Human", agent: "OpenCode", workspace: "Shared" },
      })
    if (path.endsWith("/choices")) return route.fulfill({ json: { models: [], runners: [], approvals: ["ask"] } })
    if (path.endsWith("/manage"))
      return route.fulfill({ json: request.postDataJSON()?.action === "extension.list" ? [] : { items: [] } })
    if (request.method() !== "GET") writes.push(path)
    if (path.endsWith("/chats/chat") && failure)
      return route.fulfill({ status: failure.status, json: { error: failure.error } })
    return route.fulfill({
      json: {
        turns: [],
        pending: [],
        decisions: [],
        busy: false,
        problem: null,
        detail: { title: "Saved conversation", writable: true },
      },
    })
  })

  const address = "#/workspaces/shared/conversations/chat"
  await page.goto("/component-tests/nexus-chat.html" + address)
  const title = page.getByRole("heading", { name: "Saved conversation" })
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const suggestion = page.getByRole("button", { name: config.suggestedQuestions[0] })
  const reconnect = page.getByRole("button", { name: "Reconnect", exact: true })
  await expect(title).toBeVisible()
  await editor.fill("Keep my work")

  failure = { status: 500, error: "Temporary lookup failure" }
  await page.reload()
  for (const next of [{ status: 404, error: "Conversation unavailable" }, undefined]) {
    await expect(page.getByText(failure!.error, { exact: true })).toBeVisible()
    expect(new URL(page.url()).hash).toBe(address)
    await expect(suggestion).toBeDisabled()
    await expect(editor).toHaveText("Keep my work")
    failure = next
    await reconnect.click()
  }

  await expect(title).toBeVisible()
  await expect(editor).toHaveAttribute("contenteditable", "true")
  await expect(editor).toHaveText("Keep my work")
  expect(writes).toEqual([])
})
