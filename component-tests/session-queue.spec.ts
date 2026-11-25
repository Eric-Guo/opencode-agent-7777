import type { SessionInboxInfo } from "@opencode/client/promise"
import { expect, test } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

test("a waiting steer moves to the queue, back to the transcript, and can be withdrawn", async ({ page }) => {
  const { errors } = await setupSession(page, undefined, [
    { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 10 } },
  ])
  const id = "msg_waiting"
  const text = "Waiting follow-up"
  let item: SessionInboxInfo | undefined = {
    id,
    sessionID: "ses_0",
    type: "user",
    delivery: "steer",
    payload: { text },
    time: { created: 5 },
  }
  const writes: string[] = []
  await page.route("**/api/session/ses_0/inbox", (route) => route.fulfill({ json: { data: item ? [item] : [] } }))
  await page.route("**/api/session/ses_0/inbox/msg_waiting", (route) => {
    const request = route.request()
    if (request.method() === "DELETE") {
      writes.push("DELETE")
      item = undefined
    } else {
      const { delivery } = request.postDataJSON()
      writes.push(`${request.method()} ${delivery}`)
      if (item) item = { ...item, delivery }
    }
    return route.fulfill({ status: 204 })
  })
  await page.reload()
  const row = page.locator(`[data-timeline-row="UserMessage"][data-message-id="${id}"]`)
  const panel = page.locator('[data-component="session-queue-row"]').filter({ hasText: text })
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Keep this draft")
  await expect(row.getByText("Pending", { exact: true })).toBeVisible()
  await row.locator('[data-slot="user-message-text"]').hover()
  await row.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: "Move to queue" }).click()
  await expect(panel).toHaveCount(1)
  await expect(row).toHaveCount(0)
  await panel.getByRole("button", { name: "Send", exact: true }).click()
  await expect(row).toHaveCount(1)
  await expect(panel).toHaveCount(0)
  await row.getByRole("button", { name: "More actions" }).press("ArrowDown")
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
  await expect(row).toHaveCount(0)
  await expect(panel).toHaveCount(0)
  await expect(editor).toHaveText("Keep this draft")
  expect(writes).toEqual(["PATCH queue", "PATCH steer", "DELETE"])
  expect(errors).toEqual([])
})

test("Send and Undo publish queue receipts while an older inbox read is in flight", async ({ page }) => {
  const { errors } = await setupSession(page)
  let pending: SessionInboxInfo[] = ["Send this", "Restore this"].map((text, index) => ({
    id: "msg_" + index,
    sessionID: "ses_0",
    type: "user",
    delivery: "queue",
    payload: {
      text,
      ...(index === 1
        ? { files: [{ name: "example.json", mime: "text/plain", data: "e30=", source: { type: "inline" as const } }] }
        : {}),
    },
    time: { created: index + 1 },
  }))
  const release = Promise.withResolvers<void>()
  let holdNextRead = false
  let held = false
  await page.route("**/api/session/ses_0/inbox", async (route) => {
    let data = pending
    if (holdNextRead) {
      holdNextRead = false
      held = true
      await release.promise
    } else if (held) {
      data = pending.map((item) =>
        item.type === "user" && item.id === "msg_0" ? { ...item, payload: { text: "Confirmed send" } } : item,
      )
    }
    await route.fulfill({ json: { data } })
  })
  await page.route("**/api/session/ses_0/inbox/msg_0", (route) => {
    expect(route.request().method()).toBe("PATCH")
    expect(route.request().postDataJSON()).toEqual({ delivery: "steer" })
    pending = pending.map((item) => (item.id === "msg_0" ? { ...item, delivery: "steer" } : item))
    holdNextRead = true
    return route.fulfill({ status: 204 })
  })
  await page.route("**/api/session/ses_0/inbox/msg_1", (route) => {
    expect(route.request().method()).toBe("DELETE")
    pending = pending.filter((item) => item.id !== "msg_1")
    return route.fulfill({ status: 204 })
  })
  await page.reload()
  const rows = page.locator('[data-component="session-queue-row"]')
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const timeline = page.locator('[data-slot="session-message-timeline"]')
  await expect(rows).toHaveCount(2)
  await editor.fill("Keep my draft")
  try {
    await rows.filter({ hasText: "Send this" }).getByRole("button", { name: "Send" }).click()
    await expect(timeline.getByText("Send this", { exact: true })).toHaveCount(1)
    await expect.poll(() => held).toBe(true)
    await rows.filter({ hasText: "Restore this" }).getByRole("button", { name: "Undo" }).click()
    await expect(rows).toHaveCount(0)
    await expect(editor).toContainText("Restore this")
  } finally {
    release.resolve()
  }
  await expect(timeline.getByText("Confirmed send", { exact: true })).toBeVisible()
  await expect(rows).toHaveCount(0)
  await expect(editor).toHaveText(/Keep my draft\s+Restore this/)
  await expect(timeline.getByText("Send this", { exact: true })).toHaveCount(0)
  await expect(timeline.getByText("Restore this", { exact: true })).toHaveCount(0)
  const file = { name: "example.json", mimeType: 'application/json;profile="a,b"', buffer: Buffer.from("{}") }
  const picker = page.locator('input[type="file"]')
  await picker.setInputFiles(file)
  await expect(page.getByText("This file has already been uploaded", { exact: true })).toBeVisible()
  await expect(page.getByText(file.name, { exact: true })).toHaveCount(1)
  await picker.setInputFiles({ ...file, buffer: Buffer.from('{"edited":true}') })
  await expect(page.getByText(file.name, { exact: true })).toHaveCount(2)
  await picker.setInputFiles({ ...file, name: "copy.json" })
  await expect(page.getByText("copy.json", { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
