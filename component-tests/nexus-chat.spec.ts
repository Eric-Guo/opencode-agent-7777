import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import type { BrowserPaneAPI } from "../src/runtime/platform/browser-pane"

// Exercise the real 7777 entry and editor. The fixture supplies the browser bridge
// protocol so streaming, decisions and recovery are deterministic and cost no model calls.
async function mockEvents(page: Page) {
  await page.addInitScript(() => {
    class Events extends EventTarget {
      constructor() {
        super()
        window.addEventListener("fixture-refresh", this.refresh)
        window.addEventListener("fixture-frame", this.forward)
        setTimeout(() => this.dispatchEvent(new Event("ready")), 5)
      }
      forward = (e: Event) => this.dispatchEvent(new MessageEvent("frame", { data: (e as CustomEvent).detail }))
      refresh = () => this.dispatchEvent(new Event("refresh"))
      close() {
        window.removeEventListener("fixture-refresh", this.refresh)
        window.removeEventListener("fixture-frame", this.forward)
      }
    }
    Object.defineProperty(window, "EventSource", { value: Events })
  })
}

const optionsFor = (page: Page, title: string) => page.getByRole("button", { name: `Options for ${title}`, exact: true })
const sessionItem = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true })

test("resizes the Browser beside the conversation and keeps the timeline inset", async ({ page }) => {
  await mockEvents(page)
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.addInitScript(() => {
    const api: BrowserPaneAPI = {
      async refresh() {},
      async command() {},
      async layout(bounds) {
        document.dispatchEvent(new CustomEvent("browser-layout", { detail: bounds }))
      },
      subscribe(listener) {
        listener({
          status: "ready",
          tabs: [
            { id: "tab", title: "Example", url: "about:blank", loading: false, canGoBack: false, canGoForward: false },
          ],
          focusedTabID: "tab",
          reveal: 0,
        })
        return () => {}
      },
    }
    window.nexusBrowser = api
    document.addEventListener("browser-layout", (event) => {
      document.documentElement.dataset.browserWidth = String((event as CustomEvent).detail?.width ?? 0)
    })
  })
  await page.route("**/api/7777/**", (route) => {
    const path = new URL(route.request().url()).pathname

    if (path.endsWith("/connection"))
      return route.fulfill({
        json: { scope: "fixture", user: "Human", agent: "OpenCode", workspace: "Shared", model: "m", runner: "r" },
      })
    if (path.endsWith("/choices")) return route.fulfill({ json: { models: [], runners: [], approvals: ["ask"] } })

    return route.fulfill({
      json: {
        turns: [
          {
            id: "turn",
            input: "input",
            variant: "variant",
            run: "run",
            created: 1000,
            position: 1,
            prompt: "A question",
            text: "A reply",
            status: "completed",
          },
        ],
        pending: [],
        busy: false,
        decisions: [],
        detail: { title: "Shared", owned: false, archived: false, writable: true },
      },
    })
  })

  await page.goto("/component-tests/nexus-chat.html#/workspaces/shared/conversations/chat")
  await expect(page.getByText("A reply", { exact: true })).toBeVisible()

  const scroller = page.locator('[data-slot="session-message-scroller"]')
  const timeline = page.locator('[data-slot="session-message-timeline"]')
  const inset = async () => {
    const pane = (await scroller.boundingBox())!
    const content = (await timeline.boundingBox())!
    return [content.x - pane.x, pane.x + pane.width - content.x - content.width]
  }
  const browser = page.getByRole("complementary", { name: "Browser" })
  const handle = browser.locator('[data-component="resize-handle"]')

  await page.getByRole("button", { name: "Browser", exact: true }).click()
  await expect(handle).toBeVisible()
  await expect.poll(inset).toEqual([14, 14])

  const start = (await browser.boundingBox())!
  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 130, grip.y + grip.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect.poll(async () => (await browser.boundingBox())?.width).toBe(start.width - 130)
  await expect(page.locator("html")).toHaveAttribute("data-browser-width", String(start.width - 131))
  await expect.poll(inset).toEqual([24, 24])

  await page.setViewportSize({ width: 390, height: 800 })
  await expect(handle).toBeHidden()
  await expect.poll(async () => (await browser.boundingBox())?.width).toBe(390)
  await page.getByRole("button", { name: "Close Browser pane" }).click()
  await expect.poll(inset).toEqual([14, 14])
})

test("exports with Enter, Send and the slash suggestion without sending a chat message", async ({ page }) => {
  await mockEvents(page)
  const records = [{ type: "turn", turn: { text: "你好" } }, { type: "end" }]
  let exports = 0
  let release!: () => void
  const messages: string[] = []
  await page.route("**/api/7777/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ json: body })
    if (path.endsWith("/connection"))
      return json({ scope: "export", user: "Human", agent: "OpenCode", workspace: "Shared", model: "m", runner: "r" })
    if (path.endsWith("/choices")) return json({ models: ["m"], runners: [], approvals: ["ask"] })
    if (path.endsWith("/export")) {
      expect(route.request().headers()["x-7777-scope"]).toBe("export")
      exports++
      if (exports === 1) await new Promise<void>((resolve) => (release = resolve))
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(records, null, 2) + "\n" })
    }
    if (path.endsWith("/prepare") || path.endsWith("/inputs")) {
      messages.push(route.request().postDataJSON().text)
      return route.fulfill({ status: 400, json: { error: "Fixture stops here" } })
    }
    if (route.request().method() === "POST") return json([])
    return json({
      turns: [],
      pending: [],
      busy: false,
      decisions: [],
      problem: null,
      detail: { title: "Shared", owned: false, archived: false, writable: true },
    })
  })
  await page.goto("/component-tests/nexus-chat.html#/workspaces/shared/conversations/chat")
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const send = page.getByRole("button", { name: "Send", exact: true })
  const suggestion = page.getByRole("button", { name: /^\/export/ })
  const options = optionsFor(page, "Shared")
  await expect(editor).toHaveAttribute("contenteditable", "true")

  for (const trigger of ["enter", "send", "suggestion"] as const) {
    await editor.fill(trigger === "suggestion" ? "/exp" : "/export")
    await expect(suggestion).toBeVisible()
    const saved = page.waitForEvent("download")
    if (trigger === "enter") {
      await editor.press("Escape")
      await editor.press("Enter")
      await expect.poll(() => exports).toBe(1)
      await options.click()
      await expect(sessionItem(page, "Export session")).toBeDisabled()
      await page.keyboard.press("Escape")
      await editor.fill("/export")
      await send.click()
      await expect(editor).toHaveText("")
      release()
    } else if (trigger === "send") await send.click()
    else await suggestion.click()
    const file = await saved
    expect(file.suggestedFilename()).toBe("conversation-chat.json")
    expect(JSON.parse(await readFile(await file.path(), "utf8"))).toEqual(records)
    await expect(options).toBeEnabled()
    await expect(editor).toHaveText("")
  }

  await editor.fill("/export latest")
  await editor.press("Enter")
  await expect(page.getByText("/export does not take arguments. Your draft has been kept.")).toBeVisible()
  await expect(editor).toHaveText("/export latest")
  expect(exports).toBe(3)
  expect(messages).toEqual([])

  await editor.fill("/unrelated")
  await editor.press("Enter")
  await expect.poll(() => messages).toEqual(["/unrelated"])

  await page.getByRole("button", { name: "New session", exact: true }).click()
  await expect(options).toHaveCount(0)
  await editor.fill("/export")
  await send.click()
  await expect(page.getByText("Open a saved conversation to export it.")).toBeVisible()
  expect(exports).toBe(3)
  expect(messages).toEqual(["/unrelated"])
})

test("exports a read-only conversation and retires a pending export when the conversation changes", async ({
  page,
}) => {
  await mockEvents(page)
  const downloads: string[] = []
  page.on("download", (file) => downloads.push(file.suggestedFilename()))
  const requests: string[] = []
  let release!: () => void
  await page.route("**/api/7777/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ json: body })
    if (path.endsWith("/connection"))
      return json({
        scope: JSON.stringify(["origin", "human", "shared", "agent"]),
        user: "Human",
        agent: "OpenCode",
        workspace: "Shared",
        model: "m",
        runner: "r",
      })
    if (path.endsWith("/choices")) return json({ models: ["m"], runners: [], approvals: ["ask"] })
    if (path.endsWith("/work")) return json([])
    if (path.endsWith("/export")) {
      requests.push(path)
      if (path.endsWith("/first/export")) {
        await new Promise<void>((resolve) => (release = resolve))
        return route
          .fulfill({ contentType: "application/json", body: '[\n  {"type":"end"}\n]\n' })
          .catch(() => undefined)
      }
      if (requests.length === 2) return route.fulfill({ status: 503, json: { error: "Fixture unavailable" } })
      if (requests.length === 3) return route.fulfill({ contentType: "application/json", body: '[\n  {"type":"turn"}' })
      return route.fulfill({ contentType: "application/json", body: '[\n  {"type":"end"}\n]\n' })
    }
    if (route.request().method() === "POST") return json([])
    return json({
      turns: [],
      pending: [],
      busy: false,
      decisions: [],
      problem: null,
      detail: { title: path.endsWith("/first") ? "First" : "Second", owned: false, archived: true, writable: false },
    })
  })
  await page.goto("/component-tests/nexus-chat.html#/workspaces/shared/conversations/first")
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const exportItem = sessionItem(page, "Export session")
  const ring = page.getByRole("button", { name: "View context usage", exact: true })
  const contextExport = page.getByRole("dialog", { name: "Context usage" }).getByRole("button", { name: "Export session" })
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await optionsFor(page, "First").click()
  await exportItem.click()
  await expect.poll(() => requests.length).toBe(1)
  await optionsFor(page, "First").click()
  await expect(exportItem).toBeDisabled()
  await page.keyboard.press("Escape")
  await ring.click()
  await expect(contextExport).toBeDisabled()
  await page.keyboard.press("Escape")

  await page.evaluate(() => {
    location.hash = "/workspaces/shared/conversations/second"
  })
  const second = optionsFor(page, "Second")
  await expect(second).toBeVisible()
  release()
  await second.click()
  await exportItem.click()
  await expect(page.getByText("Could not export session", { exact: true })).toBeVisible()
  await expect(page.getByText("Fixture unavailable", { exact: true })).toBeVisible()
  expect(downloads).toEqual([])

  await second.click()
  await exportItem.click()
  await expect(page.getByText("The server did not return a valid session export.", { exact: true })).toBeVisible()
  expect(downloads).toEqual([])

  const saved = page.waitForEvent("download")
  await ring.click()
  await contextExport.click()
  const file = await saved
  expect(file.suggestedFilename()).toBe("conversation-second.json")
  expect(JSON.parse(await readFile(await file.path(), "utf8"))).toEqual([{ type: "end" }])
  await expect(contextExport).toBeEnabled()
  expect(downloads).toEqual(["conversation-second.json"])
  expect(requests).toEqual([
    "/api/7777/chats/first/export",
    "/api/7777/chats/second/export",
    "/api/7777/chats/second/export",
    "/api/7777/chats/second/export",
  ])
})

test("keeps reconnect visible while pending and reports a repeated failure before recovering", async ({ page }) => {
  const failure = "Configure a Nexus origin and pair the OpenCode service."
  let reads = 0,
    release!: () => void
  await page.route("**/api/7777/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/connection")) {
      const attempt = ++reads
      if (attempt > 1) await new Promise<void>((resolve) => (release = resolve))
      if (attempt < 3) return route.fulfill({ status: 503, json: { error: failure } })
      return route.fulfill({
        json: { scope: "reconnect", user: "Human", agent: "rho", workspace: "Workspace", model: "m", runner: "local" },
      })
    }
    return route.fulfill({ json: { models: [], runners: [], approvals: ["ask"] } })
  })
  await page.goto("/component-tests/nexus-chat.html")
  const editor = page.getByRole("textbox", { name: "Message" })
  const reconnect = page.getByRole("button", { name: "Reconnect", exact: true })
  const connecting = page.getByRole("button", { name: "Connecting…", exact: true })
  await expect(reconnect).toBeVisible()
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await reconnect.click()
  await expect(connecting).toBeDisabled()
  await expect(connecting).toHaveAttribute("aria-busy", "true")
  await expect.poll(() => reads).toBe(2)
  release()
  await expect(page.getByText("Could not reconnect", { exact: true })).toBeVisible()
  await expect(page.getByText(failure, { exact: true }).first()).toBeVisible()
  await expect(reconnect).toBeEnabled()
  await reconnect.click()
  await expect(connecting).toBeDisabled()
  await expect.poll(() => reads).toBe(3)
  release()
  await expect(page.getByText("Connected to OpenCode", { exact: true })).toBeVisible()
  await expect(page.getByRole("banner")).toContainText("Ready")
  await expect(editor).toHaveAttribute("contenteditable", "true")
  await expect(reconnect).toHaveCount(0)
  await expect(connecting).toHaveCount(0)
})

test("sends text, renders partial and settled replies, restores a decision, and stops the current chat", async ({
  page,
}) => {
  await mockEvents(page)
  const done = {
    id: "turn",
    input: "in",
    variant: "v",
    run: "r",
    created: 1000,
    position: 1,
    prompt: "Hello rho",
    text: "Final response",
    status: "completed",
  }
  let accepted = false,
    settled = false,
    ask = false,
    stopped = false
  const resolutions: unknown[] = []
  await page.route("**/api/7777/**", async (route) => {
    const url = new URL(route.request().url())
    const json = async (body: unknown) => route.fulfill({ json: body })
    if (url.pathname.endsWith("/connection"))
      return json({
        scope: "fixture",
        user: "Person",
        agent: "rho",
        workspace: "Workspace",
        model: "model",
        runner: "runner",
      })
    if (url.pathname.endsWith("/choices"))
      return json({
        models: [],
        runners: [],
        approvals: ["ask"],
        modes: { code_mode: true, subagent: true, available: true, code_mode_available: true },
      })
    if (url.pathname.endsWith("/chats")) return json({ id: "chat" })
    if (url.pathname.endsWith("/prepare")) return json({ ticket: "prepared" })
    if (url.pathname.endsWith("/inputs")) {
      expect(route.request().postDataJSON().ticket).toBe("prepared")
      expect(route.request().postDataJSON().text).toBe("Hello rho")
      accepted = true
      return json({ id: "in" })
    }
    if (url.pathname.endsWith("/decisions")) {
      resolutions.push(route.request().postDataJSON())
      ask = false
      return json({})
    }
    if (url.pathname.endsWith("/stop")) {
      stopped = true
      return json({})
    }
    return json({
      turns: accepted ? [settled ? done : { ...done, text: "", status: "running" }] : [],
      pending: [],
      busy: accepted && !stopped,
      problem: null,
      decisions: ask
        ? [
            {
              run: "r",
              key: "ask",
              kind: "ask",
              prompt: "How many?",
              tool: null,
              options: null,
              multi: false,
              tool_input: null,
              fields: [{ name: "n", label: "Count", type: "integer", required: true }],
            },
          ]
        : [],
    })
  })
  await page.goto("/component-tests/nexus-chat.html")
  const editor = page.getByRole("textbox", { name: "Message" })
  await editor.fill("Hello rho")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await expect(page.getByRole("main").getByText("Hello rho", { exact: true })).toBeVisible()
  const frame = async (value: object) =>
    page.evaluate(
      (data) => window.dispatchEvent(new CustomEvent("fixture-frame", { detail: JSON.stringify(data) })),
      value,
    )
  await frame({ type: "text_delta", turn_public_id: "turn", variant_public_id: "v", text: "Partial response" })
  await expect(page.getByText("Partial response", { exact: true })).toBeVisible()
  settled = true
  await frame({ type: "turn", turn_public_id: "turn", variant_public_id: "v", turn: done })
  await expect(page.getByText("Final response", { exact: true })).toBeVisible()
  ask = true
  await page.reload()
  await page.getByLabel("Count").fill("0")
  await page.getByRole("button", { name: "Send answer" }).click()
  await expect(page.getByLabel("Count")).toHaveCount(0)
  expect(resolutions).toEqual([{ run: "r", key: "ask", response: { action: "answer", answer: { n: 0 } } }])
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
  expect(stopped).toBe(true)
})

for (const [choice, action] of [
  ["Allow once", "approve"],
  ["Deny", "deny"],
]) {
  test(`restores a live Bash approval and sends ${choice} for that task`, async ({ page }) => {
    const command = "date '+%H:%M:%S %Z'"
    const task = {
      kind: "approval",
      run: "run",
      key: "r3t0-tool-1",
      tool: "bash",
      tool_input: { command, workdir: "/work" },
    }
    let held = false
    const decisions: unknown[] = []
    await mockEvents(page)
    await page.addInitScript(() => localStorage.setItem("7777.nexus.fixture", JSON.stringify({ id: "chat" })))
    await page.route("**/api/7777/**", async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith("/connection"))
        return route.fulfill({
          json: {
            scope: "fixture",
            user: "Human",
            agent: "rho",
            workspace: "Workspace",
            model: "model",
            runner: "runner",
          },
        })
      if (path.endsWith("/decisions")) {
        decisions.push(route.request().postDataJSON())
        held = false
        return route.fulfill({ json: {} })
      }
      return route.fulfill({
        json: { turns: [], pending: [], busy: held, problem: null, decisions: held ? [task] : [] },
      })
    })
    await page.goto("/component-tests/nexus-chat.html")
    await expect(page.getByText("Workspace", { exact: false }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: choice })).toHaveCount(0)
    held = true
    await page.evaluate(() => window.dispatchEvent(new Event("fixture-refresh")))
    await expect(page.getByText(command, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText("Working directory: /work", { exact: true })).toBeVisible()
    await expect(page.getByText(command, { exact: true })).toBeVisible()
    await page.getByRole("button", { name: choice, exact: true }).click()
    await expect(page.getByRole("button", { name: choice, exact: true })).toHaveCount(0)
    expect(decisions).toEqual([{ run: task.run, key: task.key, response: { action } }])
  })
}

test("MCP approval identifies the captured account and only card focus enables its shortcuts", async ({ page }) => {
  const decisions: unknown[] = []
  const task = {
    kind: "approval",
    run: "run",
    key: "held",
    tool: "work_fetch",
    tool_input: { url: "https://docs.test" },
    mcp: { connection: "Docs", account: "Research <b>account</b>", tool: "web_fetch" },
  }
  await mockEvents(page)
  await page.addInitScript(() => localStorage.setItem("7777.nexus.fixture", JSON.stringify({ id: "chat" })))
  await page.route("**/api/7777/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/connection"))
      return route.fulfill({
        json: {
          scope: "fixture",
          user: "Human",
          agent: "rho",
          workspace: "Workspace",
          model: "model",
          runner: "runner",
        },
      })
    if (path.endsWith("/decisions")) decisions.push(route.request().postDataJSON())
    if (path.endsWith("/rounds"))
      return route.fulfill({
        json: {
          rounds: [
            {
              task_key: "r1",
              status: "completed",
              calls: { items: [{ name: task.tool, task_key: task.key, status: "completed" }] },
            },
          ],
          has_older: false,
        },
      })
    if (path.endsWith("/task"))
      return route.fulfill({
        json: { key: task.key, name: task.tool, kind: "tool_task", status: "completed", mcp: task.mcp, captures: [] },
      })
    const local = { ...task, key: "local", tool: "web_fetch", mcp: undefined, siteGrant: "https://docs.test" }
    return route.fulfill({
      json: {
        turns: [
          {
            id: "turn",
            input: "in",
            variant: "v",
            run: "run",
            created: 1,
            position: 1,
            prompt: "Fetch notes",
            text: "Received notes",
            status: "completed",
          },
        ],
        pending: [],
        busy: decisions.length < 2,
        problem: null,
        decisions: [task, local].slice(decisions.length, decisions.length + 1),
      },
    })
  })
  await page.goto("/component-tests/nexus-chat.html")
  const card = page.getByRole("group").filter({ has: page.getByRole("button", { name: "Deny" }) })
  await expect(card.getByText("work_fetch", { exact: true })).toBeVisible()
  await expect(card.locator("dd")).toHaveText(["Docs", "Research <b>account</b>", "web_fetch"])
  await expect(card.getByRole("button")).toHaveCount(2)
  await card.getByRole("button", { name: "Allow once" }).press("Escape")
  await expect(card.getByRole("button", { name: "Allow once" })).toBeVisible()
  await card.focus()
  await card.press("Enter")
  await card.getByRole("button", { name: "Allow https://docs.test until restart" }).press("Enter")
  await expect(card).toHaveCount(0)
  expect(decisions).toEqual([
    { run: "run", key: "held", response: { action: "approve" } },
    { run: "run", key: "local", response: { action: "site" } },
  ])
  await page.getByText("Tools and activity", { exact: true }).click()
  await page.getByText("work_fetch · completed").click()
  await expect(page.locator(".chat-round dd")).toHaveText(["Docs", "Research <b>account</b>", "web_fetch"])
})

test("steers a running reply, queues the next, promotes without resending, and reports partial usage", async ({
  page,
}) => {
  await mockEvents(page)
  await page.addInitScript(() => localStorage.setItem("7777.nexus.flow", JSON.stringify({ id: "chat" })))
  const repairs: unknown[] = []
  const inputs: any[] = [],
    promoted: any[] = []
  const turn = {
    id: "turn",
    variant: "v",
    input: "first",
    run: "run",
    created: 1,
    position: 1,
    prompt: "First request",
    text: "",
    status: "running",
  }
  await page.route("**/api/7777/**", async (route) => {
    const p = new URL(route.request().url()).pathname
    const json = (data: unknown) => route.fulfill({ json: data })
    if (p.endsWith("/connection"))
      return json({ scope: "flow", user: "Human", workspace: "Workspace", agent: "rho", model: "m", runner: "local" })
    if (p.endsWith("/choices"))
      return json({ models: ["m", "other"], runners: [{ id: "local", name: "Local" }], approvals: ["ask", "rules"] })
    if (p.endsWith("/work")) return json([{ id: "run", status: "running" }])
    if (p.endsWith("/run"))
      return json({
        status: "running",
        tasks: [
          {
            key: "budget",
            name: "Summary",
            status: "failed",
            unresolved: true,
            waitingOn: [],
            terminal: true,
            costLimitUrl: "https://nexus.example/conversations/chat/cost_limit/edit",
          },
        ],
      })
    if (p.endsWith("/execution")) {
      repairs.push(route.request().postDataJSON())
      return json({})
    }
    if (p.endsWith("/prepare")) return json({ ticket: "ticket" })
    if (p.endsWith("/inputs")) {
      inputs.push(route.request().postDataJSON())
      return json({ id: "in" })
    }
    if (p.endsWith("/promote")) {
      promoted.push(route.request().postDataJSON())
      return json({})
    }
    return json({
      turns: [turn],
      decisions: [],
      pending: promoted.length
        ? []
        : [
            {
              id: "waiting",
              state: "steering",
              delivery: "steer",
              position: 1,
              version: 4,
              text: "Earlier steer",
              created: 2,
            },
          ],
      busy: true,
      problem: null,
      detail: {
        active: "turn",
        title: "Running example",
        owned: false,
        archived: false,
        runner: "Local",
        version: 1,
        usage: {
          request_count: 3,
          total_tokens: 90,
          uncached_input_tokens: 60,
          cache_creation_tokens: 0,
          cache_hit_rate: 0.25,
          cost_complete: false,
          cost_amount: "0.170000000000000001",
          cost_unit: "USD",
        },
        context: {
          used_tokens: 20,
          input_tokens: 17,
          output_tokens: 3,
          cache_read_tokens: null,
          window_tokens: 99,
          used_percent: 20.20202,
          as_of_model: { provider_id: "fallback", model_ref: "actual-model" },
        },
      },
    })
  })
  await page.goto("/component-tests/nexus-chat.html")
  const editor = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("heading", { name: "Running example" })).toBeVisible()
  await editor.fill("Steer at boundary")
  await editor.press("Enter")
  await expect.poll(() => inputs.length).toBe(1)
  expect(inputs[0]).toMatchObject({ delivery: "steer", target: "run" })
  await page.getByRole("button", { name: "Run settings" }).click()
  await page.getByRole("combobox", { name: "Send behavior", exact: true }).selectOption("queue")
  await page.getByRole("combobox", { name: "Model", exact: true }).selectOption("other")
  await page.keyboard.press("Escape")
  await editor.fill("Queue it")
  await editor.press("Enter")
  await expect.poll(() => inputs.length).toBe(2)
  expect(inputs[1]).toMatchObject({ delivery: "queue", model: "other" })
  await editor.fill("Right now")
  await editor.press("Control+Enter")
  await expect.poll(() => inputs.length).toBe(3)
  expect(inputs[2]).toMatchObject({ delivery: "steer_now", target: "run" })
  await expect(editor).toHaveText("")
  await editor.press("Control+Enter")
  await expect.poll(() => promoted).toEqual([{ id: "waiting", version: 4 }])
  expect(inputs.length).toBe(3)

  const controls = page.locator('[data-slot="session-header-controls"]')
  expect(await controls.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim()),
  )).toEqual([
    "Options for Running example",
    "New session",
    "View context usage",
    "Recent sessions",
    "Memory bindings",
    "Conversation preferences",
    "EN",
  ])
  const ring = controls.getByRole("button", { name: "View context usage" })
  const circle = ring.locator('[data-component="progress-circle"][data-appearance="indicator"]')
  const occupancy = await circle.locator('[data-slot="progress-circle-progress"]').evaluate((arc) =>
    1 - Number(arc.getAttribute("stroke-dashoffset")) / Number(arc.getAttribute("stroke-dasharray")),
  )
  expect(occupancy).toBeCloseTo(0.2)
  await ring.click()
  const context = page.getByRole("dialog", { name: "Context usage" })
  await expect(context.getByText("Known subtotal", { exact: true })).toBeVisible()
  await expect(context.getByText("0.170000000000000001 USD")).toBeVisible()
  await expect(context.getByText("Cost unit", { exact: true }).locator("+ dd")).toHaveText("USD")
  await expect(context.getByText("fallback/actual-model")).toBeVisible()
  const latest = context.locator("dl").filter({ hasText: "Actual model" })
  await expect(latest.getByText("Input tokens", { exact: true }).locator("+ dd")).toHaveText("17")
  await expect(latest.getByText("Output tokens", { exact: true }).locator("+ dd")).toHaveText("3")
  await expect(latest.getByText("Cached input tokens", { exact: true }).locator("+ dd")).toHaveText("Not reported")
  await expect(context.getByText("Uncached input tokens", { exact: true }).locator("+ dd")).toHaveText("60")
  await expect(context.getByText("Cache creation tokens", { exact: true }).locator("+ dd")).toHaveText("0")
  await expect(context.getByText("Cache hit rate", { exact: true }).locator("+ dd")).toHaveText("25%")
  await expect(context.getByText("20 / 99 (20.2%)")).toBeVisible()
  await expect(context.getByRole("region", { name: "Activity" }).getByText("running", { exact: true })).toBeVisible()
  await expect(context.getByRole("link", { name: "Edit cost limit in Nexus" })).toHaveAttribute(
    "href",
    "https://nexus.example/conversations/chat/cost_limit/edit",
  )
  await expect(context.getByRole("button", { name: "Abandon step" })).toBeVisible()
  expect(repairs).toEqual([])
  await context.getByRole("button", { name: "Retry step" }).click()
  await expect.poll(() => repairs).toEqual([{ action: "retry", run: "run", key: "budget" }])
  await page.keyboard.press("Escape")
  await expect(ring).toBeFocused()
})

test("opens child conversations from activity and returns to the parent's draft", async ({ page }) => {
  await mockEvents(page)
  const children = [
    { id: "busy", name: "Research", busy: true },
    { id: "idle", name: "Review", busy: false },
  ]
  await page.route("**/api/7777/**", (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ json: body })
    if (path.endsWith("/connection"))
      return json({
        scope: JSON.stringify(["user", "agent", "w"]),
        user: "Human",
        workspace: "Workspace",
        agent: "Agent",
        model: "m",
      })
    if (path.endsWith("/choices")) return json({ models: ["m"], runners: [], approvals: ["ask"] })
    if (path.endsWith("/children")) return json({ items: children, next: null })
    if (path.endsWith("/work")) return json([{ id: "run", status: "needs_attention" }])
    if (path.endsWith("/run"))
      return json({
        status: "needs_attention",
        tasks: [{ key: "step", name: "Model", status: "failed", waitingOn: [], contextOverflow: true }],
      })
    if (path.endsWith("/task"))
      return json({
        key: "step",
        kind: "model_task",
        status: "failed",
        error: { detail: "Limit <div>8192</div>" },
        contextOverflow: true,
        captures: [],
      })
    const child = children.find((item) => path.endsWith("/chats/" + item.id))
    return json({
      turns: [],
      pending: [],
      decisions: [],
      busy: child?.busy ?? false,
      detail: { title: child?.name ?? "Parent", owned: !!child, writable: !child, archived: false, version: 1 },
    })
  })
  await page.goto("/component-tests/nexus-chat.html#/workspaces/w/conversations/parent")
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Parent draft")
  for (const child of children) {
    await page.getByRole("button", { name: "View context usage" }).click()
    const dialog = page.getByRole("dialog", { name: "Context usage" })
    if (child.busy) {
      await expect(dialog.getByText(/Input token limit or Combined context window/)).toHaveCount(1)
      await dialog.getByText("Model · failed").click()
      await expect(dialog.getByText(/Input token limit or Combined context window/)).toHaveCount(2)
      await expect(dialog.locator("pre").filter({ hasText: "Limit <div>8192</div>" })).toBeVisible()
    }
    await dialog.getByText("Child conversations", { exact: true }).click()
    await dialog.getByRole("button", { name: "Open " + child.name }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp("/conversations/" + child.id + "$"))
    await expect(page.getByRole("heading", { name: child.name, exact: true })).toBeVisible()
    await expect(editor).toHaveAttribute("contenteditable", "false")
    await page.goBack()
    await expect(page.getByRole("heading", { name: "Parent", exact: true })).toBeVisible()
    await expect(editor).toHaveText("Parent draft")
  }
})

test("inspects the latest recorded system prompt and fetches raw messages on demand", async ({ page }) => {
  await mockEvents(page)
  const reads: string[] = []
  await page.route("**/api/7777/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const json = (data: unknown) => route.fulfill({ json: data })
    if (path.endsWith("/connection"))
      return json({ scope: "context", user: "Human", workspace: "Shared", agent: "OpenCode", model: "m", runner: "r" })
    if (path.endsWith("/choices")) return json({ models: [], runners: [], approvals: [] })
    if (path.endsWith("/work")) return json([])
    if (path.endsWith("/system-prompt")) {
      reads.push(`system ${url.searchParams.get("turn")} ${url.searchParams.get("variant")}`)
      return json("## Sealed system instructions")
    }
    if (path.endsWith("/raw-message")) {
      reads.push(`raw ${url.searchParams.get("turn")}`)
      return json({ public_id: "new", role: "assistant", active_variant: { content: "Original stored response" } })
    }
    if (route.request().method() === "POST") return json([])
    return json({
      turns: ["old", "new"].map((id, index) => ({
        id,
        variant: `${id}-v`,
        run: `${id}-run`,
        position: index + 1,
        created: 1,
        prompt: `Question ${id}`,
        text: "Projected response",
        status: "completed",
      })),
      pending: [],
      busy: false,
      decisions: [],
      problem: null,
      detail: {
        title: "Context fixture",
        owned: false,
        writable: false,
        archived: false,
        usage: { total_tokens: 4400 },
      },
    })
  })
  await page.goto("/component-tests/nexus-chat.html#/workspaces/shared/conversations/context")
  const ring = page.getByRole("button", { name: "View context usage" })
  await ring.hover()
  await expect(page.getByRole("tooltip")).toContainText("4,400")
  await ring.click()
  const dialog = page.getByRole("dialog", { name: "Context usage" })
  const system = dialog.getByRole("button", { name: "System prompt", exact: true })
  const messages = dialog.getByRole("button", { name: "Raw messages", exact: true })
  await expect(system).toHaveAttribute("aria-expanded", "false")
  await expect(messages).toHaveAttribute("aria-expanded", "false")
  expect(reads).toEqual([])

  await system.click()
  await expect(dialog.getByRole("heading", { name: "Sealed system instructions" })).toBeVisible()
  await messages.click()
  await expect(dialog.getByRole("button", { name: "Turn 1 • old" })).toBeVisible()
  expect(reads).toEqual(["system new new-v"])
  await dialog.getByRole("button", { name: "Turn 2 • new" }).click()
  await expect(dialog.getByRole("region", { name: "Turn 2 • new" })).toContainText("Original stored response")
  expect(reads).toEqual(["system new new-v", "raw new"])
})

test("shows completed turn changes inline, keeps each variant’s files, and remembers manual review", async ({ page }) => {
  await mockEvents(page)
  await page.addInitScript(() => localStorage.setItem("7777.nexus.output", JSON.stringify({ id: "chat" })))
  let variant = "old",
    release!: () => void,
    oldStarted = false,
    reviewReads: string[] = [],
    roundReads = 0
  const delayed = new Promise<void>((r) => (release = r))
  await page.route("**/api/7777/**", async (route) => {
    const url = new URL(route.request().url()),
      p = url.pathname
    const json = (data: unknown) => route.fulfill({ json: data })
    if (p.endsWith("/connection"))
      return json({ scope: "output", user: "Human", workspace: "Workspace", agent: "rho", model: "m", runner: "local" })
    if (p.endsWith("/choices")) return json({ models: ["m"], runners: [], approvals: ["ask"] })
    if (p.endsWith("/files")) {
      if (url.searchParams.get("variant") === "old") {
        oldStarted = true
        await delayed
        return json([{ id: "old", name: "old.zip" }])
      }
      return json([{ id: "new", name: "report.md" }])
    }
    if (p.endsWith("/bytes"))
      return route.fulfill({ body: "# Previewed output", contentType: "application/octet-stream" })
    if (p.endsWith("/review")) {
      const requested = url.searchParams.get("variant")!
      reviewReads.push(requested)
      if (requested === "old") await delayed
      return json([
        {
          runner: "Local",
          root: "project",
          base: "base",
          run: "run",
          files: [
            {
              path: requested === "old" ? "superseded.txt" : "readme.txt",
              state: "text",
              additions: 1,
              deletions: 1,
              patch: "@@ -1 +1 @@\n-old\n+new",
              status: "modified",
            },
          ],
        },
      ])
    }
    if (p.endsWith("/rounds")) {
      roundReads++
      return json({ rounds: [{ task_key: "r1", status: "completed", calls: { items: [] } }], has_older: false })
    }
    if (p.endsWith("/task"))
      return json({
        key: "r1",
        name: "Round one",
        output: "Recorded output",
        status: "completed",
        kind: "model_task",
        captures: [],
        sealed: true,
      })
    if (p.endsWith("/request")) return json({ entries: ["A captured request"] })
    return json({
      busy: false,
      pending: [],
      decisions: [],
      problem: null,
      turns: [
        {
          id: "turn",
          variant,
          input: "in",
          run: "run",
          created: 1,
          position: 1,
          prompt: "Report",
          text: "The report is ready.",
          status: "completed",
          files: true,
          review: true,
        },
      ],
    })
  })
  await page.goto("/component-tests/nexus-chat.html")
  await expect.poll(() => oldStarted).toBe(true)
  await expect.poll(() => reviewReads).toEqual(["old"])
  variant = "new"
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-refresh")))
  await expect(page.getByText("report.md", { exact: true })).toBeVisible()
  release()
  expect(roundReads).toBe(0)
  const review = page.locator('[data-component="session-review"]')
  await expect(review.getByText("readme.txt")).toBeVisible()
  await expect(review.getByText("superseded.txt")).toHaveCount(0)
  expect(reviewReads).toEqual(["old", "new"])
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await expect(page.getByText("Previewed output")).toBeVisible()
  await expect(page.getByText("old.zip")).toHaveCount(0)
  await review.getByText("readme.txt", { exact: true }).click()
  await review.locator('[data-line-type="change-addition"][data-column-number]').click()
  const comment = review.getByRole("textbox")
  await expect(comment).toBeVisible()
  await comment.fill("Keep this line")
  await comment.press("Enter")
  const draft = page.getByRole("textbox", { name: "Message" })
  await expect(draft).toContainText("Keep this line")
  await expect(draft).toContainText('"variant": "new"')
  await expect(draft).toContainText('"turn": "turn"')
  await page.getByText("Tools and activity", { exact: true }).click()
  await page.getByText("Round r1 · completed").click()
  await expect(page.getByText("Recorded output")).toBeVisible()
  await page.getByText("Read sealed model request").click()
  await expect(page.getByText("A captured request", { exact: false })).toBeVisible()

  await page.getByRole("button", { name: "Conversation preferences" }).click()
  const preference = page.getByRole("menuitemcheckbox", { name: "Changed files" })
  await expect(preference).toBeChecked()
  await preference.click()
  await expect(review).toHaveCount(0)
  await page.reload()
  const manual = page.getByText("Review changes", { exact: true })
  await expect(manual).toBeVisible()
  expect(reviewReads).toEqual(["old", "new"])
  await manual.click()
  await expect(review.getByText("readme.txt")).toBeVisible()
  expect(reviewReads).toEqual(["old", "new", "new"])
})

for (const structured of [false, 0, null])
  test(`Code Mode output and structured ${structured} survive approval and reload without resubmitting`, async ({
    page,
  }) => {
    await mockEvents(page)
    const prompt = "Run the Code Mode output check once."
    const token = "VISIBLE_" + crypto.randomUUID()
    const printed = JSON.stringify({ status: "completed", is_error: false, content: [{ type: "text", text: token }] })
    const output = ["first", printed, "last"].join("\n")
    const writes: { path: string; body: unknown }[] = []
    const state = { accepted: false, held: false }

    await page.route("**/api/7777/**", async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const path = url.pathname
      const json = (body: unknown) => route.fulfill({ json: body })

      if (path.endsWith("/connection"))
        return json({
          scope: "code-output",
          user: "Human",
          agent: "OpenCode",
          workspace: "Workspace",
          runner: "runner",
          model: "model",
        })

      if (path.endsWith("/choices"))
        return json({
          models: ["model"],
          runners: [{ id: "runner", name: "Local" }],
          approvals: ["ask"],
          modes: { code_mode: true, subagent: false, available: true, code_mode_available: true },
        })

      if (path.endsWith("/manage")) return json(req.postDataJSON().action === "extension.list" ? [] : { items: [] })

      if (path.endsWith("/chats")) return json({ id: "chat" })

      if (path.endsWith("/modes"))
        return json({ code_mode: true, subagent: false, available: true, code_mode_available: true })

      if (path.endsWith("/prepare")) return json({ ticket: "captured-policy" })

      if (path.endsWith("/inputs")) {
        writes.push({ path, body: req.postDataJSON() })
        state.accepted = true
        state.held = true

        return json({ id: "input" })
      }

      if (path.endsWith("/decisions")) {
        writes.push({ path, body: req.postDataJSON() })
        state.held = false

        return json({})
      }

      if (path.endsWith("/rounds"))
        return json({
          rounds: [
            {
              task_key: "r1",
              status: "completed",
              calls: { items: [{ task_key: "code", name: "code", status: "completed" }] },
            },
          ],
          has_older: false,
        })

      if (path.endsWith("/task"))
        return json({
          key: url.searchParams.get("key"),
          name: url.searchParams.get("key") === "code" ? "code" : "Round one",
          kind: url.searchParams.get("key") === "code" ? "tool_task" : "model_task",
          status: "completed",
          output: url.searchParams.get("key") === "code" ? output : token,
          ...(url.searchParams.get("key") === "code" ? { structured } : {}),
          captures: [],
          sealed: url.searchParams.get("key") !== "code",
        })

      if (path.endsWith("/request"))
        return json({
          entries: [
            {
              type: "tool_result_item",
              payload: { call_id: "code", content: output.split("\n").map((text) => ({ type: "text", text })) },
            },
          ],
          request_options: {},
        })

      return json({
        turns: state.accepted
          ? [
              {
                id: "turn",
                variant: "variant",
                input: "input",
                run: "run",
                position: 1,
                created: 1,
                prompt,
                text: state.held ? "" : token,
                status: state.held ? "running" : "completed",
              },
            ]
          : [],
        pending: [],
        busy: state.held,
        problem: null,
        decisions: state.held
          ? [{ kind: "approval", run: "run", key: "bash", tool: "bash", tool_input: { command: "uuidgen" } }]
          : [],
      })
    })
    await page.goto("/component-tests/nexus-chat.html")
    const editor = page.getByRole("textbox", { name: "Message", exact: true })
    const answer = page.locator('[data-component="markdown"]').getByText(token, { exact: true })

    await editor.fill(prompt)
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await expect(page.getByText("uuidgen", { exact: true })).toBeVisible()
    await expect(answer).toHaveCount(0)
    await page.getByRole("button", { name: "Allow once", exact: true }).click()
    await expect(answer).toBeVisible()
    await expect(editor).toHaveText("")
    expect(writes.map((row) => row.path)).toEqual(["/api/7777/chats/chat/inputs", "/api/7777/chats/chat/decisions"])
    expect(writes[0].body).toMatchObject({ text: prompt, ticket: "captured-policy" })
    expect(writes[1].body).toEqual({ run: "run", key: "bash", response: { action: "approve" } })
    await page.getByText("Tools and activity", { exact: true }).click()
    await page.getByText("code · completed", { exact: true }).click()
    await expect(page.getByText(output, { exact: true })).toBeVisible()
    await expect(page.getByLabel("Structured output", { exact: true }).locator("pre")).toHaveText(
      JSON.stringify(structured),
    )
    await page.getByText("Round r1 · completed", { exact: true }).click()
    await page.getByText("Read sealed model request", { exact: true }).click()
    await expect(page.locator("pre").filter({ hasText: '"type": "tool_result_item"' })).toContainText(token)
    await page.reload()
    await expect(answer).toBeVisible()
    await expect(editor).toHaveText("")
    await expect(page.getByRole("button", { name: "Allow once", exact: true })).toHaveCount(0)
    await page.getByText("Tools and activity", { exact: true }).click()
    await page.getByText("code · completed", { exact: true }).click()
    await expect(page.getByText(output, { exact: true })).toBeVisible()
    await expect(page.getByLabel("Structured output", { exact: true }).locator("pre")).toHaveText(
      JSON.stringify(structured),
    )
    expect(writes.map((row) => row.path)).toEqual(["/api/7777/chats/chat/inputs", "/api/7777/chats/chat/decisions"])
  })

test("renames, archives, reopens from a later archived page and restores the conversation draft", async ({ page }) => {
  await mockEvents(page)
  let archived = false,
    title = "Design notes",
    version = 1
  const pageRequests: string[] = []
  const row = (id: string, name: string) => ({ id, title: name, time: { created: 2 } })
  await page.addInitScript(() =>
    localStorage.setItem("7777.nexus.archive", JSON.stringify({ id: "notes", text: "Unsent note" })),
  )
  await page.route("**/api/7777/**", async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname
    const json = (v: unknown) => route.fulfill({ json: v })
    if (path.endsWith("/connection"))
      return json({
        scope: "archive",
        user: "Human",
        workspace: "Workspace",
        agent: "rho",
        model: "m",
        runner: "local",
      })
    if (path.endsWith("/choices")) return json({ models: [], runners: [], approvals: ["ask"] })
    if (path.endsWith("/chats")) {
      if (u.searchParams.get("archived") !== "1")
        return json({ items: archived ? [] : [row("notes", title)], next: null })
      const cursor = u.searchParams.get("after") || "first"
      pageRequests.push(cursor)
      return json(
        cursor === "first"
          ? { items: [row("old", "Earlier chat")], next: "second" }
          : { items: archived ? [row("notes", title)] : [], next: null },
      )
    }
    if (path.endsWith("/rename")) {
      const b = route.request().postDataJSON()
      expect(b.version).toBe(version)
      title = b.title
      version++
      return json({})
    }
    if (path.endsWith("/archive") || path.endsWith("/restore")) {
      archived = path.endsWith("/archive")
      version++
      return json({})
    }
    return json({
      turns: [],
      decisions: [],
      pending: [],
      busy: false,
      problem: null,
      detail: { title, archived, owned: false, version, runner: "Local", active: null },
    })
  })
  await page.goto("/component-tests/nexus-chat.html")
  const editor = page.getByRole("textbox", { name: "Message" })
  await expect(editor).toHaveText("Unsent note")
  await optionsFor(page, "Design notes").click()
  await sessionItem(page, "Rename session").click()
  await page.getByRole("textbox", { name: "Rename session" }).fill("Revised notes")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Revised notes" })).toBeVisible()
  await optionsFor(page, "Revised notes").click()
  await sessionItem(page, "Archive").click()
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await page.getByRole("button", { name: "New session" }).click()
  await editor.fill("Different draft")
  await page.getByRole("button", { name: "Recent sessions" }).click()
  await page.getByRole("button", { name: "Archived", exact: true }).click()
  await page.getByRole("button", { name: "Load more" }).click()
  await page.getByRole("option", { name: /Revised notes/ }).click()
  await expect(editor).toHaveText("Unsent note")
  await optionsFor(page, "Revised notes").click()
  await sessionItem(page, "Restore").click()
  await expect(editor).toHaveAttribute("contenteditable", "true")
  expect(pageRequests).toEqual(["first", "second"])
  await page.getByRole("button", { name: "New session" }).click()
  await expect(editor).toHaveText("Different draft")
})

test("session menus target the chosen row and confirm deletion without replacing another draft", async ({ page }) => {
  await mockEvents(page)
  const chats = new Map([
    ["current", { title: "Current", version: 3 }],
    ["other", { title: "Other", version: 7 }],
  ])
  const writes: string[] = []
  await page.addInitScript(() =>
    localStorage.setItem("7777.nexus.menus.draft.", JSON.stringify({ text: "New-session draft" })),
  )
  await page.route("**/api/7777/**", async (route) => {
    const parts = new URL(route.request().url()).pathname.slice("/api/7777/".length).split("/")
    const [resource, id, action] = parts
    const json = (body: unknown) => route.fulfill({ json: body })
    if (resource === "connection")
      return json({ scope: "menus", user: "Human", workspace: "Workspace", agent: "OpenCode", model: "m", runner: "r" })
    if (resource === "choices") return json({ models: [], runners: [], approvals: ["ask"] })
    if (resource !== "chats") return json([])
    if (!id) return json({ items: [...chats].map(([id, row]) => ({ id, title: row.title, time: { created: 2 } })), next: null })
    const chat = chats.get(id)
    if (!chat) return route.fulfill({ status: 404, json: { error: "Session missing" } })
    const detail = { ...chat, archived: false, owned: false, writable: true }
    if (action === "options") return json(detail)
    if (action === "export") {
      return route.fulfill({ contentType: "application/json", body: `[\n  ${JSON.stringify({ type: "end", id })}\n]\n` })
    }
    if (action === "rename") {
      const { title, version } = route.request().postDataJSON()
      expect(version).toBe(chat.version)
      writes.push(`rename ${id}`)
      chats.set(id, { title, version: version + 1 })
      return json({})
    }
    if (action === "delete") {
      writes.push(`delete ${id}`)
      chats.delete(id)
      return json({})
    }
    return json({ turns: [], pending: [], busy: false, decisions: [], problem: null, detail })
  })

  await page.goto("/component-tests/nexus-chat.html#/workspaces/shared/conversations/current")
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const recent = page.getByRole("button", { name: "Recent sessions", exact: true })
  await expect(optionsFor(page, "Current")).toBeVisible()
  await editor.fill("Current draft")
  await recent.click()
  await page.getByRole("option", { name: /Other/ }).click({ button: "right" })
  await sessionItem(page, "Rename session").click()
  const title = page.getByRole("textbox", { name: "Rename session" })
  await expect(title).toBeFocused()
  await expect(title).toHaveValue("Other")
  await title.fill("  Renamed  ")
  await title.press("Enter")
  await expect(title).toBeHidden()
  await expect(editor).toHaveText("Current draft")

  await recent.click()
  await optionsFor(page, "Renamed").click()
  const downloaded = page.waitForEvent("download")
  await sessionItem(page, "Export session").click()
  const file = await downloaded
  expect(file.suggestedFilename()).toBe("conversation-other.json")
  expect(JSON.parse(await readFile(await file.path(), "utf8"))).toEqual([{ type: "end", id: "other" }])

  const confirm = page.getByRole("dialog", { name: "Delete session", exact: true })
  await recent.click()
  await optionsFor(page, "Renamed").click()
  await sessionItem(page, "Delete session…").click()
  await expect(confirm).toContainText('Delete session "Renamed"?')
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused()
  await confirm.getByRole("button", { name: "Cancel" }).click()
  await expect(recent).toBeFocused()
  expect(writes).toEqual(["rename other"])

  await recent.click()
  await optionsFor(page, "Renamed").click()
  await sessionItem(page, "Delete session…").click()
  await confirm.getByRole("button", { name: "Delete session" }).click()
  await expect(confirm).toBeHidden()
  await expect(editor).toHaveText("Current draft")
  await recent.click()
  await expect(page.getByText("No recent sessions", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")

  await optionsFor(page, "Current").click()
  await sessionItem(page, "Delete session…").click()
  await confirm.getByRole("button", { name: "Delete session" }).click()
  await expect(editor).toHaveText("New-session draft")
  await expect(optionsFor(page, "Current")).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem("7777.nexus.menus.draft.current"))).toBeNull()
  expect(writes).toEqual(["rename other", "delete other", "delete current"])
})

test("keyboard mode choices survive a new draft reload, and a lost receipt reuses the prepared reply", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockEvents(page)
  const defaults = { available: true, code_mode_available: true, code_mode: true, subagent: false }
  let saved = { ...defaults },
    prepares = 0
  const patches: unknown[] = [],
    inputs: unknown[] = []
  await page.route("**/api/7777/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const json = (body: unknown) => route.fulfill({ json: body })
    if (path.endsWith("/connection"))
      return json({ scope: "modes", user: "Human", agent: "rho", workspace: "Workspace", model: "m", runner: "local" })
    if (path.endsWith("/choices")) return json({ models: ["m"], runners: [], approvals: ["ask"], modes: defaults })

    if (path.endsWith("/chats")) {
      expect(req.postDataJSON()).toMatchObject({ title: "", runner: "local" })

      return json({ id: "new" })
    }
    if (path.endsWith("/modes")) {
      if (req.method() === "POST") {
        const change = req.postDataJSON()
        patches.push(change)
        saved = { ...saved, ...change }
      }
      return json(saved)
    }
    if (path.endsWith("/prepare")) {
      prepares++
      expect(saved).toMatchObject({ code_mode: false, subagent: true })
      return json({ ticket: "original-policy" })
    }
    if (path.endsWith("/inputs")) {
      inputs.push(req.postDataJSON())
      if (inputs.length === 1) {
        saved = { ...defaults }
        return route.fulfill({ status: 503, json: { error: "Lost input receipt" } })
      }
      return json({ id: "accepted" })
    }
    return json({ turns: [], pending: [], decisions: [], busy: false, problem: null })
  })
  await page.goto("/component-tests/nexus-chat.html")
  const settings = page.getByRole("button", { name: "Run settings" })
  const code = page.getByRole("switch", { name: "Code mode" }),
    subagent = page.getByRole("switch", { name: "Subagent" })
  const editor = page.getByRole("textbox", { name: "Message" })
  await settings.click()
  await expect(code).toBeChecked()
  await code.press("Space")
  await subagent.press("Space")
  await expect(code).not.toBeChecked()
  await expect(subagent).toBeChecked()
  expect(patches).toHaveLength(0)
  await page.reload()
  await settings.click()
  await expect(code).not.toBeChecked()
  await expect(subagent).toBeChecked()
  await page.keyboard.press("Escape")
  await editor.fill("Check policy")
  await editor.press("Enter")
  await expect(page.getByText("Lost input receipt")).toBeVisible()
  await expect(settings).toBeDisabled()
  await page.reload()
  await expect(editor).toHaveText("Check policy")
  expect(inputs).toHaveLength(1)
  await editor.press("Enter")
  await expect(editor).toHaveText("")
  expect(inputs).toHaveLength(2)
  expect(inputs[1]).toEqual(inputs[0])
  expect(prepares).toBe(1)
  expect(patches).toEqual([{ code_mode: false, subagent: true }])
  await settings.click()
  await expect(code).toBeChecked()
  await expect(subagent).not.toBeChecked()
  await code.press("Space")
  await expect(code).not.toBeChecked()
  expect(patches[1]).toEqual({ code_mode: false })
})

test("read-only access disables conversation edits and updates when write access returns", async ({ page }) => {
  await mockEvents(page)
  const state = { writable: false, archived: false, unavailable: false }
  const writes: string[] = []

  await page.route("**/api/7777/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ json: body })

    if (state.unavailable && path === "/api/7777/chats/chat")
      return route.fulfill({ status: 403, json: { error: "Access ended" } })

    if (path.endsWith("/connection"))
      return json({
        scope: "read-only",
        user: "Human",
        workspace: "Shared",
        agent: "OpenCode",
        model: "m",
        runner: "r",
      })

    if (path.endsWith("/choices")) return json({ models: ["m"], runners: [], approvals: ["ask"] })

    if (path.endsWith("/restore")) {
      writes.push(path)
      state.archived = false

      return json({})
    }

    if (route.request().method() === "POST")
      return json(route.request().postDataJSON()?.action === "extension.list" ? [] : { items: [] })

    return json({
      turns: [],
      pending: [],
      busy: false,
      decisions: [],
      problem: null,
      detail: { title: "Shared", owned: false, runner: "r", version: 0, active: null, ...state },
    })
  })
  await page.goto("/component-tests/nexus-chat.html#/workspaces/shared/conversations/chat")
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  const actions = optionsFor(page, "Shared")

  await expect(editor).toHaveAttribute("contenteditable", "false")
  await expect(page.getByText("This conversation is read-only.", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Run settings", exact: true })).toBeDisabled()
  await actions.click()
  await expect(sessionItem(page, "Rename session")).toBeDisabled()
  await expect(sessionItem(page, "Archive")).toBeDisabled()
  await expect(sessionItem(page, "Delete session…")).toBeDisabled()
  await expect(sessionItem(page, "Export session")).toBeEnabled()
  await page.keyboard.press("Escape")
  state.writable = true
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-refresh")))
  await expect(editor).toHaveAttribute("contenteditable", "true")
  await expect(page.getByText("This conversation is read-only.", { exact: true })).toHaveCount(0)
  state.archived = true
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-refresh")))
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await actions.click()
  await sessionItem(page, "Restore").click()
  await expect(editor).toHaveAttribute("contenteditable", "true")
  expect(writes).toEqual(["/api/7777/chats/chat/restore"])
  state.unavailable = true
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-refresh")))
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await expect(actions).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeVisible()
})

test("HTTP recovery updates idle metadata and access without stream events and stops after access loss", async ({
  page,
}) => {
  await page.clock.install()
  await mockEvents(page)
  const state = { title: "Waiting for title", writable: true, unavailable: false, reads: 0 }

  await page.route("**/api/7777/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ json: body })

    if (path.endsWith("/connection"))
      return json({ scope: "poll", user: "Human", agent: "OpenCode", workspace: "Shared", model: "m", runner: "r" })

    if (path.endsWith("/choices")) return json({ models: ["m"], runners: [], approvals: ["ask"] })

    if (route.request().method() === "POST")
      return json(route.request().postDataJSON()?.action === "extension.list" ? [] : { items: [] })

    state.reads++

    if (state.unavailable) return route.fulfill({ status: 403, json: { error: "Access ended" } })

    return json({
      turns: [],
      pending: [],
      busy: false,
      decisions: [],
      problem: null,
      detail: { title: state.title, writable: state.writable, owned: false, archived: false },
    })
  })
  await page.goto("/component-tests/nexus-chat.html#/workspaces/shared/conversations/chat")
  const editor = page.getByRole("textbox", { name: "Message", exact: true })

  await expect(page.getByRole("heading", { name: state.title, exact: true })).toBeVisible()
  await editor.fill("Unsent draft")
  state.title = "Generated title"
  state.writable = false
  await page.clock.fastForward(3000)
  await expect(page.getByRole("heading", { name: state.title, exact: true })).toBeVisible()
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await expect(editor).toHaveText("Unsent draft")
  state.unavailable = true
  await page.clock.fastForward(3000)
  await expect(optionsFor(page, "Generated title")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeVisible()
  const reads = state.reads

  await page.clock.fastForward(9000)
  expect(state.reads).toBe(reads)
})
