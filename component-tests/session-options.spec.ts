import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

async function setup(page: Page, deleteEventFirst = false) {
  const location = { directory: "/fixture" }
  const sessions = ["First", "Second"].map((title, index) => ({
    id: `ses_${index}`,
    title,
    projectID: "project",
    location,
    agent: "7777",
    time: { created: index + 1, updated: index + 1 },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }))
  const writes: string[] = []
  const exports: string[] = []
  const holdDelete = deleteEventFirst
  const deleted = Promise.withResolvers<string>()
  const release = Promise.withResolvers<void>()
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Object.assign(window, { api: { awaitInitialization: async () => ({ url: location.origin }) } })
    localStorage.setItem("opencode.7777.session.id", "ses_0")
  })
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (value: unknown) => route.fulfill({ json: value })
    if (path === "/api/event") {
      let body = ": connected\n\n"
      if (deleteEventFirst) {
        deleteEventFirst = false
        body = await deleted.promise
      }
      return route.fulfill({ contentType: "text/event-stream", body })
    }
    if (path === "/api/session/active") return json({ data: {} })
    if (path === "/api/session") return json({ data: sessions, cursor: {} })
    const session = sessions.find((s) => path === `/api/session/${s.id}`)
    if (session && request.method() === "GET") return json({ data: session })
    if (session && request.method() === "PATCH") {
      writes.push(`rename ${session.id}`)
      session.title = request.postDataJSON().title
      return route.fulfill({ status: 204 })
    }
    if (session && request.method() === "DELETE") {
      writes.push(`delete ${session.id}`)
      sessions.splice(sessions.indexOf(session), 1)
      if (holdDelete) {
        const event = {
          id: "evt_fixture_delete",
          created: 10,
          type: "session.deleted",
          data: { sessionID: session.id },
          location,
          durable: { aggregateID: session.id, seq: 1, version: 2 },
        }
        deleted.resolve(`data: ${JSON.stringify(event)}\n\n`)
        await release.promise
      }
      return route.fulfill({ status: 204 })
    }
    if (path.endsWith("/export")) {
      const id = path.split("/").at(-2)!
      exports.push(id)
      await release.promise
      return json({ data: { info: sessions.find((s) => s.id === id), messages: [] } })
    }
    if (path.endsWith("/message")) return json({ data: [], cursor: {} })
    if (path === "/api/model/default") return json({ location, data: null })
    if (request.method() === "GET") return json({ location, data: [] })
    throw new Error(`Unexpected ${request.method()} ${path}`)
  })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Options for First" })).toBeVisible()
  return { writes, exports, release, errors }
}

test("rename and delete target the chosen recent row and retain the active draft", async ({ page }) => {
  const { writes, errors } = await setup(page)
  const recent = page.getByRole("button", { name: "Recent sessions", exact: true })
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Keep my draft")
  await recent.click()
  await page.getByRole("option", { name: /Second/ }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "Rename session" }).click()
  const field = page.getByRole("textbox", { name: "Rename session" })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue("Second")
  await field.fill("   ")
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
  await field.fill("  Renamed  ")
  await field.press("Enter")
  await expect(field).toBeHidden()
  await recent.click()
  await page.getByRole("button", { name: "Options for Renamed" }).click()
  await page.getByRole("menuitem", { name: "Delete session" }).click()
  const confirm = page.getByRole("dialog", { name: "Delete session" })
  await expect(confirm).toContainText('Delete session "Renamed"?')
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused()
  await confirm.getByRole("button", { name: "Cancel" }).click()
  await expect(recent).toBeFocused()
  expect(writes).toEqual(["rename ses_1"])
  await recent.click()
  await page.getByRole("button", { name: "Options for Renamed" }).click()
  await page.getByRole("menuitem", { name: "Delete session" }).click()
  await confirm.getByRole("button", { name: "Delete session" }).click()
  await expect(confirm).toBeHidden()
  await recent.click()
  await expect(page.getByRole("option")).toHaveCount(0)
  await expect(editor).toHaveText("Keep my draft")
  expect(writes).toEqual(["rename ses_1", "delete ses_1"])
  expect(errors).toEqual([])
})

test("active rename retries a failure and confirmed deletion opens a neighbor or a fresh draft", async ({ page }) => {
  const { writes, errors } = await setup(page)
  await page.getByRole("button", { name: "Options for First" }).click()
  await page.getByRole("menuitem", { name: "Rename session" }).click()
  const field = page.getByRole("textbox", { name: "Rename session" })
  await field.fill("My title")
  await page.route("**/api/session/ses_0", (route) => route.fulfill({ status: 503, body: "Unavailable" }), { times: 1 })
  await field.press("Enter")
  await expect(page.getByRole("alert")).toBeVisible()
  await expect(field).toHaveValue("My title")
  await field.press("Enter")
  for (const title of ["My title", "Second"]) {
    await page.getByRole("button", { name: `Options for ${title}` }).click()
    await page.getByRole("menuitem", { name: "Delete session" }).click()
    await page.getByRole("dialog", { name: "Delete session" }).getByRole("button", { name: "Delete session" }).click()
  }
  await expect(page.getByRole("button", { name: "View context usage" })).toBeHidden()
  await expect.poll(() => page.evaluate(() => localStorage.getItem("opencode.7777.session.id"))).toBeNull()
  expect(writes).toEqual(["rename ses_0", "delete ses_0", "delete ses_1"])
  expect(errors).toEqual([])
})

test("context and session menus share export admission and download the selected transcript", async ({ page }) => {
  const { exports, release, errors } = await setup(page)
  await page.getByRole("button", { name: "View context usage" }).click()
  const details = page.getByRole("dialog", { name: "Context usage" })
  const button = details.getByRole("button", { name: "Export session" })
  const downloading = page.waitForEvent("download")
  await button.click()
  await expect(button).toBeDisabled()
  await details.getByRole("button", { name: "Close" }).click()
  await page.getByRole("button", { name: "Options for First" }).click()
  await expect(page.getByRole("menuitem", { name: "Export session" })).toBeDisabled()
  release.resolve()
  const download = await downloading
  expect(download.suggestedFilename()).toBe("first.json")
  expect(JSON.parse(await readFile((await download.path())!, "utf8")).info.id).toBe("ses_0")
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Recent sessions" }).click()
  await page.getByRole("button", { name: "Options for Second" }).click()
  const other = page.waitForEvent("download")
  await page.getByRole("menuitem", { name: "Export session" }).click()
  expect((await other).suggestedFilename()).toBe("second.json")
  expect(exports).toEqual(["ses_0", "ses_1"])
  expect(errors).toEqual([])
})

test("a deletion event releases the dialog and write lock before HTTP finishes", async ({ page }) => {
  const { release, writes, errors } = await setup(page, true)
  await page.getByRole("button", { name: "Options for First" }).click()
  await page.getByRole("menuitem", { name: "Delete session" }).click()
  const confirm = page.getByRole("dialog", { name: "Delete session" })
  await confirm.getByRole("button", { name: "Delete session" }).click()
  try {
    await expect(confirm).toBeHidden()
    await page.getByRole("button", { name: "Options for Second" }).click()
    await expect(page.getByRole("menuitem", { name: "Rename session" })).toBeEnabled()
  } finally {
    release.resolve()
  }
  expect(writes).toEqual(["delete ses_0"])
  expect(errors).toEqual([])
})

test("a stalled delete keeps the session and requires a fresh confirmation to retry", async ({ page }) => {
  const { writes } = await setup(page)
  await page.clock.install()
  const options = page.getByRole("button", { name: "Options for First" })
  await options.click()
  await page.getByRole("menuitem", { name: "Delete session" }).click()
  const dialog = page.getByRole("dialog", { name: "Delete session" })
  const remove = dialog.getByRole("button", { name: "Delete session" })
  const arrived = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  await page.route(
    "**/api/session/ses_0",
    async (route) => {
      arrived.resolve()
      await release.promise
      await route.abort()
    },
    { times: 1 },
  )
  try {
    await remove.click()
    await arrived.promise
    await expect(remove).toBeDisabled()
    await page.clock.fastForward(15_100)
    await expect(dialog.getByRole("alert")).toContainText("timed out")
    await expect(remove).toBeEnabled()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(options).toBeVisible()
    expect(writes).toEqual([])
  } finally {
    release.resolve()
  }
})
