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
