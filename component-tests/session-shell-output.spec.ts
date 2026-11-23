import type { SessionMessageInfo } from "@opencode/client/promise"
import { expect, test } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

const location = { directory: "C:\\Work\\Agent" }
const inventoryUrl = /\/api\/shell\?/
const outputUrl = /\/api\/shell\/[^/]+\/output\?/
const pageOf = (output: string, cursor: number) => ({
  location,
  data: { output, cursor, size: cursor, truncated: false },
})

test("an expanded user shell streams by cursor and navigation retires the pending read", async ({ page }) => {
  const history: SessionMessageInfo[] = [
    {
      id: "direct",
      type: "shell",
      shellID: "sh_direct",
      command: "direct command",
      status: "running",
      time: { created: 1 },
    },
  ]
  const { errors } = await setupSession(page, undefined, history)
  const cursors: number[] = []
  const release = Promise.withResolvers<void>()
  let inventories = 0
  await page.route(inventoryUrl, (route) => {
    inventories++
    return route.fulfill({ json: { location, data: [] } })
  })
  await page.route(outputUrl, async (route) => {
    const query = new URL(route.request().url()).searchParams
    expect(query.get("location[directory]")).toBe(location.directory)
    const cursor = Number(query.get("cursor"))
    cursors.push(cursor)
    if (!cursor) return route.fulfill({ json: pageOf("first chunk\n", 12) })
    await release.promise
    return route.fulfill({ json: pageOf("retired chunk\n", 26) })
  })
  await page.getByRole("button", { name: /direct command/ }).click()
  await expect(page.getByText("first chunk", { exact: false })).toBeVisible()
  await expect.poll(() => cursors).toEqual([0, 12])
  await page.getByRole("button", { name: "Recent sessions" }).click()
  await page.getByRole("option", { name: /Second/ }).click()
  await expect(page.getByRole("button", { name: "Options for Second" })).toBeVisible()
  release.resolve()
  await expect(page.getByText("retired chunk")).toHaveCount(0)
  expect(inventories).toBe(1)
  expect(errors).toEqual([])
})

test("a background shell survives a stale list, reads its exit and refreshes inventory on reconnect", async ({
  page,
}) => {
  await page.clock.install()
  const id = "sh_background"
  const history: SessionMessageInfo[] = [
    { id: "user", type: "user", text: "Follow the command", time: { created: 1 } },
    {
      id: "assistant",
      type: "assistant",
      agent: "7777",
      model: { id: "fixture", providerID: "fixture" },
      time: { created: 2, completed: 3 },
      content: [
        {
          type: "tool",
          id: "call",
          name: "shell",
          time: { created: 2, completed: 3 },
          state: {
            status: "completed",
            input: { command: "background command" },
            content: [],
            metadata: { status: "running", shellID: id },
          },
        },
      ],
    },
  ]
  const { errors } = await setupSession(page, undefined, history)
  const gates = Array.from({ length: 3 }, () => Promise.withResolvers<void>())
  const list = Promise.withResolvers<void>()
  const canonical = { directory: "c:/work/agent/" }
  const info = {
    id,
    status: "running",
    command: "background command",
    cwd: location.directory,
    metadata: {},
    file: "output",
    shell: "sh",
    time: { started: 1 },
  }
  const events = [
    { type: "shell.created", location: canonical, data: { info } },
    { type: "shell.exited", location: canonical, data: { id, status: "exited", exit: 0 } },
    { type: "server.connected", data: {} },
  ]
  let stream = 0
  let inventories = 0
  let output = "started\n"
  const cursors: number[] = []
  await page.route("**/api/event", async (route) => {
    const index = stream++
    if (gates[index]) await gates[index].promise
    const body = events[index] ? "data: " + JSON.stringify(events[index]) + "\n\n" : ": heartbeat\n\n"
    return route.fulfill({ contentType: "text/event-stream", body })
  })
  await page.route(inventoryUrl, async (route) => {
    inventories++
    if (inventories === 1) await list.promise
    return route.fulfill({ json: { location: canonical, data: [] } })
  })
  await page.route(outputUrl, (route) => {
    const cursor = Number(new URL(route.request().url()).searchParams.get("cursor"))
    cursors.push(cursor)
    return route.fulfill({ json: pageOf(output.slice(cursor), output.length) })
  })
  const settings = page.getByRole("button", { name: "Follow-up behavior" })
  await settings.click()
  await page.getByRole("menuitemcheckbox", { name: "Expand shell tool parts" }).click()
  const consoleOutput = page.locator('[data-slot="session-message-timeline"]')
  await expect(consoleOutput).toContainText("started")
  expect(inventories).toBe(1)
  output += "created during read\n"
  gates[0].resolve()
  await expect(consoleOutput).toContainText("created during read")
  list.resolve()
  output += "after stale inventory\n"
  await expect(consoleOutput).toContainText("after stale inventory")

  output += "final line\n"
  gates[1].resolve()
  await expect(consoleOutput).toContainText("final line")
  gates[2].resolve()
  await expect.poll(() => inventories).toBe(2)
  // Once the shell exits the shared follower stops at the final cursor.
  const reads = cursors.length
  await page.clock.runFor(3_000)
  expect(cursors).toHaveLength(reads)
  expect(errors).toEqual([])
})
