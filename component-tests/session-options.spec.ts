import { expect, test, type Page } from "@playwright/test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { readFile } from "node:fs/promises"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

type WriteEvent =
  | { type: "session.deleted"; data: { sessionID: string } }
  | { type: "session.renamed"; data: { sessionID: string; title: string } }

async function setup(page: Page, beforeResponse?: WriteEvent[], history: SessionMessageInfo[] = []) {
  const location = { directory: "C:\\Work\\Agent" }
  const sessions = ["First", "Second"].map((title, index) => ({
    id: `ses_${index}`,
    title,
    projectID: "project",
    location: index === 0 ? location : { directory: "c:/work/agent/" },
    agent: "7777",
    time: { created: index + 1, updated: index + 1 },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }))
  const messages = new Map([[sessions[0].id, history]])
  const writes: string[] = []
  const exports: string[] = []
  let firstStream = true
  const eventsReady = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const forkResponded = Promise.withResolvers<void>()
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
      if (!firstStream || !beforeResponse)
        return route.fulfill({ contentType: "text/event-stream", body: ": connected\n\n" })
      firstStream = false
      await eventsReady.promise
      const body = beforeResponse
        .map((event, index) => {
          const session = sessions.find((item) => item.id === event.data.sessionID)
          if (session && event.type === "session.renamed") session.title = event.data.title
          const envelope = {
            ...event,
            id: `evt_fixture_${index}`,
            created: 10 + index,
            location: session?.location ?? location,
            durable: { aggregateID: event.data.sessionID, seq: index + 1, version: 2 },
          }
          return `data: ${JSON.stringify(envelope)}\n\n`
        })
        .join("")
      return route.fulfill({ contentType: "text/event-stream", body })
    }
    if (path === "/api/session/active") return json({ data: {} })
    if (path === "/api/session") return json({ data: sessions, cursor: {} })
    const session = sessions.find((s) => path === `/api/session/${s.id}`)
    if (session && request.method() === "GET") return json({ data: session })
    if (session && request.method() === "PATCH") {
      writes.push(`rename ${session.id}`)
      session.title = request.postDataJSON().title
      eventsReady.resolve()
      if (beforeResponse) await release.promise
      return route.fulfill({ status: 204 })
    }
    if (session && request.method() === "DELETE") {
      writes.push(`delete ${session.id}`)
      sessions.splice(sessions.indexOf(session), 1)
      eventsReady.resolve()
      if (beforeResponse) await release.promise
      return route.fulfill({ status: 204 })
    }
    if (path === "/api/session/ses_0/fork" && request.method() === "POST") {
      const { before } = request.postDataJSON()
      const boundary = history.findIndex((message) => message.id === before)
      expect(boundary).toBeGreaterThanOrEqual(0)
      writes.push(`fork ${before}`)
      const fork = { ...sessions[0], id: "ses_fork", title: "Fork" }
      sessions.push(fork)
      messages.set(fork.id, history.slice(0, boundary))
      await release.promise
      return json({ data: fork }).finally(forkResponded.resolve)
    }
    if (path.endsWith("/export")) {
      const id = path.split("/").at(-2)!
      exports.push(id)
      await release.promise
      return json({ data: { info: sessions.find((s) => s.id === id), messages: [] } })
    }
    if (path.endsWith("/message"))
      return json({ data: messages.get(path.split("/").at(-2)!)?.toReversed() ?? [], cursor: {} })
    if (path === "/api/model/default") return json({ location, data: null })
    if (request.method() === "GET") return json({ location, data: [] })
    throw new Error(`Unexpected ${request.method()} ${path}`)
  })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Options for First" })).toBeVisible()
  return { writes, exports, release, forkResponded: forkResponded.promise, emitEvents: eventsReady.resolve, errors }
}

test("Changed files loads completed visible turns by default, remembers opt-out and retries the selected turn", async ({
  page,
}) => {
  const history: SessionMessageInfo[] = []
  for (let i = 0; i < 11; i++) {
    const created = 4 * i
    history.push(
      { id: `user-${i}`, type: "user", text: `Turn ${i}`, time: { created } },
      {
        id: `step-${i}`,
        type: "assistant",
        agent: "7777",
        model: { id: "fixture", providerID: "fixture" },
        content: [{ type: "text", text: `Answer ${i}` }],
        snapshot: { start: "before", end: "after", files: [0, 9, 10].includes(i) ? [`turn-${i}.txt`] : [] },
        time: { created: created + 1, completed: created + 2 },
      },
    )
    if (i !== 10) history.push({ id: `idle-${i}`, type: "idle", outcome: "succeeded", time: { created: created + 3 } })
  }
  const reads: URL[] = []
  page.on("request", (req) => {
    const url = new URL(req.url())
    if (url.pathname.endsWith("/diff")) reads.push(url)
  })
  const { errors } = await setup(page, undefined, history)
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Keep my draft")
  const header = page.locator("header")
  await expect(header).toContainText("9/9", { useInnerText: false })
  const diffs = page.locator('[data-slot="session-turn-diffs"]')
  const expected = { from: "user-9", context: "3" }
  const queries = () => reads.map((url) => Object.fromEntries(url.searchParams))
  await expect.poll(queries).toEqual([expected])

  const settings = page.getByRole("button", { name: "Follow-up behavior" })
  const setting = page.getByRole("menuitemcheckbox", { name: "Changed files" })
  await settings.click()
  await expect(setting).toBeChecked()
  await setting.click()
  await page.reload()
  await expect(header).toContainText("9/9", { useInnerText: false })
  await expect(diffs).toHaveCount(0)
  await settings.click()
  await expect(setting).not.toBeChecked()
  expect(queries()).toEqual([expected])
  const patch = {
    file: "turn-9.txt",
    patch: "@@ -1 +1 @@\n-old\n+new\n",
    additions: 1,
    deletions: 1,
    status: "modified",
  }
  await page.route("**/api/session/ses_0/diff?**", (route) => route.fulfill({ json: { data: [patch] } }))
  await page.route("**/api/session/ses_0/diff?**", (route) => route.fulfill({ status: 503 }), { times: 1 })
  await setting.click()
  await expect(diffs).toHaveCount(1)
  await expect(diffs).toContainText("turn-9.txt")
  await diffs.getByRole("button", { name: "Retry" }).click()
  await expect(diffs).toContainText("+1")
  await expect(diffs.getByRole("button", { name: "Retry" })).toHaveCount(0)
  await diffs.getByRole("button", { name: /turn-9\.txt/ }).click()
  await expect(diffs.locator('[data-component="apply-patch-file-diff"]')).toBeVisible()
  expect(queries()).toEqual([expected, expected, expected])
  await expect(editor).toHaveText("Keep my draft")

  await page.reload()
  await expect(diffs).toContainText("+1")
  await settings.click()
  await expect(setting).toBeChecked()
  await setting.click()
  await expect(diffs).toHaveCount(0)
  await expect(header).toContainText("9/9", { useInnerText: false })
  expect(errors).toEqual([])
})

test("a rename in an equivalent directory refreshes the open picker", async ({ page }) => {
  const { emitEvents, writes } = await setup(page, [
    { type: "session.renamed", data: { sessionID: "ses_1", title: "Second renamed remotely" } },
  ])
  await page.getByRole("button", { name: "Recent sessions", exact: true }).click()
  const search = page.getByRole("combobox")
  await search.fill("Second")
  await expect(page.getByRole("option", { name: /Second/ })).toBeVisible()
  emitEvents()
  await expect(page.getByRole("option", { name: /Second renamed remotely/ })).toBeVisible()
  await expect(search).toHaveValue("Second")
  expect(writes).toEqual([])
})

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
  const { release, writes, errors } = await setup(page, [{ type: "session.deleted", data: { sessionID: "ses_0" } }])
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

test("delete retries a mismatched not-found response and accepts one for the selected session", async ({ page }) => {
  await setup(page)
  const missing = ["ses_1", "ses_0"]
  await page.route("**/api/session/ses_0", (route) => {
    if (route.request().method() !== "DELETE") return route.fallback()
    return route.fulfill({
      status: 404,
      json: { _tag: "SessionNotFoundError", sessionID: missing.shift(), message: "Session not found" },
    })
  })
  await page.getByRole("button", { name: "Options for First" }).click()
  await page.getByRole("menuitem", { name: "Delete session" }).click()
  const dialog = page.getByRole("dialog", { name: "Delete session" })
  const remove = dialog.getByRole("button", { name: "Delete session" })
  await remove.click()
  await expect(dialog.getByRole("alert")).toContainText("Session not found")
  await remove.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("button", { name: "Options for Second" })).toBeVisible()
  expect(missing).toEqual([])
})

test("a matching rename event releases the dialog before HTTP finishes", async ({ page }) => {
  const { release, writes } = await setup(page, [
    { type: "session.renamed", data: { sessionID: "ses_0", title: "New" } },
  ])
  try {
    await page.getByRole("button", { name: "Options for First" }).click()
    await page.getByRole("menuitem", { name: "Rename session" }).click()
    const field = page.getByRole("textbox", { name: "Rename session" })
    await field.fill("New")
    await field.press("Enter")
    await expect(field).toBeHidden()
    await page.getByRole("button", { name: "Options for New" }).click()
    await expect(page.getByRole("menuitem", { name: "Delete session" })).toBeEnabled()
    expect(writes).toEqual(["rename ses_0"])
  } finally {
    release.resolve()
  }
})

test("other rename events keep the save pending, and its response preserves a newer title", async ({ page }) => {
  const { release, writes } = await setup(page, [
    { type: "session.renamed", data: { sessionID: "ses_1", title: "Requested" } },
    { type: "session.renamed", data: { sessionID: "ses_0", title: "Newer" } },
  ])
  try {
    await page.getByRole("button", { name: "Options for First" }).click()
    await page.getByRole("menuitem", { name: "Rename session" }).click()
    const field = page.getByRole("textbox", { name: "Rename session" })
    await field.fill("Requested")
    await field.press("Enter")
    await expect(page.locator('[aria-label="Options for Newer"]')).toBeAttached()
    await expect(field).toBeDisabled()
  } finally {
    release.resolve()
  }
  await expect(page.getByRole("dialog", { name: "Rename session" })).toBeHidden()
  await expect(page.getByRole("button", { name: "Options for Newer" })).toBeVisible()
  expect(writes).toEqual(["rename ses_0"])
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

const forkHistory: SessionMessageInfo[] = Array.from({ length: 11 }, (_, index) => ({
  type: "user",
  id: `msg_${String(index).padStart(2, "0")}`,
  text: index === 2 ? "Review @agent" : `Prompt ${index}`,
  ...(index === 2
    ? {
        agents: [{ name: "agent", mention: { text: "@agent", start: 7, end: 13 } }],
        files: [{ name: "notes.txt", mime: "text/plain", data: "aGk=", source: { type: "inline" as const } }],
      }
    : {}),
  time: { created: index + 1 },
}))

async function selectFork(page: Page) {
  const message = page.locator('[data-component="user-message"]').filter({ hasText: "Review @agent" })
  await message.locator('[data-slot="user-message-text"]').hover()
  await message.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: "Fork from here" }).click()
}

test("forks before the oldest visible prompt and restores its draft through hydration retry", async ({ page }) => {
  const { writes, release, errors } = await setup(page, undefined, forkHistory)
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const header = page.locator("header")
  await expect(header).toContainText("9/9", { useInnerText: false })
  await editor.fill("Keep my draft")
  await selectFork(page)
  const dialog = page.getByRole("dialog", { name: "Fork from here" })
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(editor).toHaveText("Keep my draft")
  expect(writes).toEqual([])
  await selectFork(page)
  await dialog.getByRole("button", { name: "Replace draft and fork" }).click()
  await expect.poll(() => writes).toEqual(["fork msg_02"])
  await page.route(
    "**/api/session/ses_fork/message?**",
    (route) => route.fulfill({ status: 503, body: "History unavailable" }),
    { times: 1 },
  )
  release.resolve()
  await expect(page.getByRole("button", { name: "Options for Fork" })).toBeVisible()
  await expect(editor.locator('[data-mention="agent"]')).toHaveText("@agent")
  await expect(editor).toHaveText("Review @agent")
  await expect(page.getByText("notes.txt", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(header).toContainText("2/9", { useInnerText: false })
  await expect(editor).toHaveText("Review @agent")
  await page.getByRole("button", { name: "Recent sessions" }).click()
  await page.getByRole("option", { name: /First/ }).click()
  await expect(header).toContainText("9/9", { useInnerText: false })
  await expect(page.getByText("Prompt 10", { exact: true })).toBeVisible()
  expect(writes).toEqual(["fork msg_02"])
  expect(errors).toEqual([])
})

for (const open of [false, true]) {
  test(`edits during a fork require confirmation before ${open ? "opening" : "keeping"} the created session`, async ({
    page,
  }) => {
    const { writes, release } = await setup(page, undefined, forkHistory)
    await selectFork(page)
    await expect.poll(() => writes).toEqual(["fork msg_02"])
    const other = page.locator('[data-component="user-message"]').filter({ hasText: "Prompt 10" })
    await other.locator('[data-slot="user-message-text"]').hover()
    await other.getByRole("button", { name: "More actions" }).click()
    await expect(page.getByRole("menuitem", { name: "Fork from here" })).toBeDisabled()
    await page.keyboard.press("Escape")
    const editor = page.getByRole("textbox", { name: "Message", exact: true })
    await editor.fill("Written during creation")
    release.resolve()
    const dialog = page.getByRole("dialog", { name: "Fork from here" })
    await dialog.getByRole("button", { name: open ? "Replace draft and open fork" : "Cancel" }).click()
    await expect(editor).toHaveText(open ? "Review @agent" : "Written during creation")
    await expect(page.getByRole("button", { name: open ? "Options for Fork" : "Options for First" })).toBeVisible()
    if (!open) {
      await page.getByRole("button", { name: "Recent sessions" }).click()
      await expect(page.getByRole("option", { name: /Fork/ })).toBeVisible()
    }
    expect(writes).toEqual(["fork msg_02"])
  })
}

for (const retire of ["navigation", "timeout"]) {
  test(`ignores a fork response after ${retire}`, async ({ page }) => {
    const { writes, release, forkResponded } = await setup(page, undefined, forkHistory)
    await page.clock.install()
    await selectFork(page)
    await expect.poll(() => writes).toEqual(["fork msg_02"])
    if (retire === "timeout") {
      await page.clock.fastForward(30_001)
      await expect(page.getByText(/operation timed out/i)).toBeVisible()
    } else {
      await page.getByRole("button", { name: "Recent sessions" }).click()
      await page.getByRole("option", { name: /Second/ }).click()
    }
    const editor = page.getByRole("textbox", { name: "Message", exact: true })
    await editor.fill("Keep this draft")
    release.resolve()
    await forkResponded
    await expect(
      page.getByRole("button", { name: retire === "timeout" ? "Options for First" : "Options for Second" }),
    ).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(editor).toHaveText("Keep this draft")
    expect(writes).toEqual(["fork msg_02"])
  })
}
