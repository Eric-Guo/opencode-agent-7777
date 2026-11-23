import { expect, test, type Page } from "@playwright/test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { readFile } from "node:fs/promises"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

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
  const { errors } = await setupSession(page, undefined, history)
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
  const { emitEvents, writes } = await setupSession(page, [
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
  const { writes, errors } = await setupSession(page)
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
  const { writes, errors } = await setupSession(page)
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
  const { exports, release, errors } = await setupSession(page)
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
  const { release, writes, errors } = await setupSession(page, [
    { type: "session.deleted", data: { sessionID: "ses_0" } },
  ])
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
  await setupSession(page)
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
  const { release, writes } = await setupSession(page, [
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
  const { release, writes } = await setupSession(page, [
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
  const { writes } = await setupSession(page)
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

test("the fork command searches the visible prompts and forks once from an attachment-only message", async ({
  page,
}) => {
  const history: SessionMessageInfo[] = [...forkHistory]
  history[3] = {
    id: "msg_03",
    type: "user",
    time: { created: 4 },
    text: "",
    files: [{ name: "diagram.txt", mime: "text/plain", data: "aGk=", source: { type: "inline" } }],
  }
  history[4] = {
    id: "msg_04",
    type: "shell",
    shellID: "shell_1",
    command: "pwd",
    status: "exited",
    time: { created: 5 },
  }
  history[5] = {
    id: "msg_05",
    type: "user",
    text: "Model-only note",
    metadata: { displayText: "Displayed question", comments: [] },
    time: { created: 6 },
  }
  const { writes, release, errors } = await setupSession(page, undefined, history)
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const dialog = page.getByRole("dialog", { name: "Fork from message" })
  const search = dialog.getByRole("combobox")
  const reads: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/message")) reads.push(request.url())
  })
  await editor.fill("Keep this draft")
  await page.getByRole("button", { name: "Add images and files" }).click()
  await page.getByRole("menuitem", { name: /Commands/ }).click()
  await page.getByRole("button", { name: /^\/fork / }).click()
  await expect(search).toBeFocused()
  await expect(dialog.getByRole("option")).toHaveText([
    "Prompt 10",
    "Prompt 9",
    "Prompt 8",
    "Prompt 7",
    "Prompt 6",
    "Displayed question",
    "diagram.txt",
    "Review @agent",
  ])
  await search.fill("Model-only note")
  await expect(dialog.getByText("No messages found")).toBeVisible()
  await search.press("Escape")
  await expect(editor).toBeFocused()
  await expect(editor).toHaveText("Keep this draft")
  await editor.fill("/fork")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await search.fill("DIAGRAM")
  await expect(dialog.getByRole("option")).toHaveText(["diagram.txt"])
  expect(reads).toEqual([])
  try {
    await search.press("Enter")
    await expect.poll(() => writes).toEqual(["fork msg_03"])
    await expect(editor).toHaveText("")
    release.resolve()
    await expect(page.getByRole("button", { name: "Options for Fork" })).toBeVisible()
    await expect(page.getByText("diagram.txt", { exact: true })).toBeVisible()
    expect(writes).toEqual(["fork msg_03"])
    expect(errors).toEqual([])
  } finally {
    release.resolve()
  }
})

test("typing /fork keeps attached files and excludes pending and reverted prompts", async ({ page }) => {
  // A steer lives in the inbox until delivered. A matching transcript row acknowledges delivery.
  const { sessions, writes } = await setupSession(page, undefined, [forkHistory[0], forkHistory[2], forkHistory[3]])
  await page.route("**/api/session/ses_0", (route) =>
    route.fulfill({ json: { data: { ...sessions[0], revert: { messageID: "msg_03" } } } }),
  )
  await page.route("**/api/session/ses_0/inbox", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "msg_01",
            sessionID: "ses_0",
            delivery: "steer",
            type: "user",
            payload: { text: "Prompt 1" },
            time: { created: 2 },
          },
        ],
      },
    }),
  )
  await page.reload()
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await expect(page.locator('[data-component="user-message"]').getByText("Prompt 1", { exact: true })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: "unsent.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("draft"),
  })
  const attachment = page.getByText("unsent.txt", { exact: true })
  await expect(attachment).toBeVisible()
  await editor.fill("/fork")
  await page.getByRole("button", { name: /^\/fork / }).click()
  const picker = page.getByRole("dialog", { name: "Fork from message" })
  await expect(picker.getByRole("option")).toHaveText(["Review @agent", "Prompt 0"])
  await picker.getByRole("option", { name: "Prompt 0" }).click()
  const confirmation = page.getByRole("dialog", { name: "Fork from here" })
  await confirmation.getByRole("button", { name: "Cancel" }).click()
  await expect(editor).toHaveText("")
  await expect(attachment).toBeVisible()
  expect(writes).toEqual([])
})

test("an unresolved fork trigger retains the draft and a deployed command receives its arguments", async ({ page }) => {
  const { sessions, writes, errors } = await setupSession(page, undefined, forkHistory)
  const catalog = Promise.withResolvers<void>()
  await page.route("**/api/command?**", async (route) => {
    await catalog.promise
    await route.fulfill({
      json: { location: sessions[0].location, data: [{ name: "fork", description: "Server fork" }] },
    })
  })
  const commands: object[] = []
  await page.route("**/api/session/ses_0/agent", (route) => route.fulfill({ status: 204 }))
  await page.route("**/api/session/ses_0/command", (route) => {
    commands.push(route.request().postDataJSON())
    return route.fulfill({ status: 204 })
  })
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const send = page.getByRole("button", { name: "Send", exact: true })
  try {
    await page.reload()
    await editor.fill("/fork")
    await send.click()
    await expect(editor).toHaveText("/fork")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    expect(commands).toEqual([])
    catalog.resolve()
    await page.getByRole("button", { name: "Add images and files" }).click()
    await page.getByRole("menuitem", { name: /Commands/ }).click()
    await expect(page.getByRole("button", { name: "/fork Server fork" })).toBeVisible()
    await page.getByRole("textbox", { name: "Commands", exact: true }).press("Escape")
    await editor.fill("/fork server arguments")
    await send.click()
    await expect.poll(() => commands).toMatchObject([{ name: "fork", text: "server arguments" }])
    await expect(page.getByRole("dialog")).toHaveCount(0)
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  } finally {
    catalog.resolve()
  }
})

test("forks before the oldest visible prompt and restores its draft through hydration retry", async ({ page }) => {
  const { writes, release, errors } = await setupSession(page, undefined, forkHistory)
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
    const { writes, release } = await setupSession(page, undefined, forkHistory)
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
    const { writes, release, forkResponded } = await setupSession(page, undefined, forkHistory)
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
