import { expect, test } from "@playwright/test"

// Exercise the real 7777 entry and editor. The fixture supplies the browser bridge
// protocol so streaming, decisions and recovery are deterministic and cost no model calls.
async function mockEvents(page: import("@playwright/test").Page) {
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

test("steers a running reply, queues the next, promotes without resending, and reports partial usage", async ({
  page,
}) => {
  await mockEvents(page)
  await page.addInitScript(() => localStorage.setItem("7777.nexus.flow", JSON.stringify({ id: "chat" })))
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
        usage: { request_count: 3, total_tokens: 90, cost_complete: false, cost_amount: "0.17", cost_unit: "USD" },
        context: { used_tokens: 20, window_tokens: 100, used_percent: 20, as_of_model: { model_ref: "actual-model" } },
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
  await page.getByRole("button", { name: "Usage", exact: true }).click()
  await expect(page.getByText("Known subtotal", { exact: true })).toBeVisible()
  await expect(page.getByText("0.17 USD")).toBeVisible()
  await expect(page.getByText("actual-model")).toBeVisible()
})

test("keeps slow answer files with their variant and loads recorded changes and rounds on demand", async ({ page }) => {
  await mockEvents(page)
  await page.addInitScript(() => localStorage.setItem("7777.nexus.output", JSON.stringify({ id: "chat" })))
  let variant = "old",
    release!: () => void,
    oldStarted = false,
    reviewReads = 0,
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
      reviewReads++
      return json([
        {
          runner: "Local",
          root: "project",
          base: "base",
          run: "run",
          files: [
            {
              path: "readme.txt",
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
  variant = "new"
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-refresh")))
  await expect(page.getByText("report.md", { exact: true })).toBeVisible()
  release()
  expect(roundReads).toBe(0)
  expect(reviewReads).toBe(0)
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await expect(page.getByText("Previewed output")).toBeVisible()
  await expect(page.getByText("old.zip")).toHaveCount(0)
  await page.getByText("Review changes", { exact: true }).click()
  await page.getByText("readme.txt", { exact: true }).click()
  const review = page.locator('[data-component="session-review"]')
  await review.locator('[data-line-type="change-addition"][data-line]').click()
  const comment = review.getByRole("textbox")
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
  const actions = page.getByRole("button", { name: "Conversation actions" }),
    editor = page.getByRole("textbox", { name: "Message" })
  await expect(editor).toHaveText("Unsent note")
  await actions.click()
  await page.getByRole("textbox", { name: "Conversation title" }).fill("Revised notes")
  await page.getByRole("button", { name: "Rename", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Revised notes" })).toBeVisible()
  await actions.click()
  await page.getByRole("button", { name: "Archive", exact: true }).click()
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await page.getByRole("button", { name: "New session" }).click()
  await editor.fill("Different draft")
  await page.getByRole("button", { name: "Recent sessions" }).click()
  await page.getByRole("button", { name: "Archived", exact: true }).click()
  await page.getByRole("button", { name: "Load more" }).click()
  await page.getByRole("option", { name: /Revised notes/ }).click()
  await expect(editor).toHaveText("Unsent note")
  await actions.click()
  await page.getByRole("button", { name: "Restore", exact: true }).click()
  await expect(editor).toHaveAttribute("contenteditable", "true")
  expect(pageRequests).toEqual(["first", "second"])
  await page.getByRole("button", { name: "New session" }).click()
  await expect(editor).toHaveText("Different draft")
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
    if (path.endsWith("/chats")) return json({ id: "new" })
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
