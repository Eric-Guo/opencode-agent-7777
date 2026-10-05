// Exercises the real production bundle against a private, deterministic HTTP/SSE fixture.
// Build with VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false before running.
import { chromium, expect } from "@playwright/test"
import type { AudioStatus } from "@opencode/client/promise"
import { join, resolve } from "node:path"

const count = Number(process.env.BENCH_RUNS ?? 10)
const output = process.env.BENCH_OUTPUT ?? "node_modules/.cache/runtime-benchmark.json"
const dist = resolve(process.env.BENCH_DIST ?? join(import.meta.dir, "../dist"))
const directory = "/fixture/agent7777"
const location = { directory }
const sessions = ["a", "b"].map((id) => ({
  id: `ses_benchmark_${id}`,
  projectID: "project",
  location,
  title: `Benchmark ${id.toUpperCase()}`,
  agent: "7777",
  time: { created: 1, updated: 2 },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
}))
const model = {
  id: "fixture",
  modelID: "fixture",
  providerID: "openai",
  name: "Fixture",
  capabilities: { tools: true, input: ["text"], output: ["text"] },
  variants: [],
  time: { released: 1 },
  cost: [],
  status: "active",
  enabled: true,
  limit: { context: 100000, output: 10000 },
}
const messages = (id: string) =>
  Array.from({ length: 40 }, (_, index) => [
    { id: `msg_${id}_${index}_user`, type: "user", text: `${id} question ${index}`, time: { created: index * 3 } },
    {
      id: `msg_${id}_${index}_assistant`,
      type: "assistant",
      agent: "7777",
      model: { id: "fixture", providerID: "openai" },
      content: [{ type: "text", text: `${id} answer ${index}` }],
      time: { created: index * 3 + 1, completed: index * 3 + 2 },
    },
  ]).flat()
const streams = new Set<ReadableStreamDefaultController<Uint8Array>>()
const errors: string[] = []
const requests: Record<string, number> = {}
let sequence = 0
const emit = (type: string, data: object) => {
  const event = {
    id: `evt_benchmark_${++sequence}`,
    type,
    created: 1000 + sequence,
    data,
    location,
    durable: { aggregateID: sessions[1].id, seq: sequence, version: 1 },
  }
  for (const stream of streams) {
    try {
      stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
    } catch {
      streams.delete(stream)
    }
  }
}
const json = (value: unknown) => Response.json(value)
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url)
    const path = url.pathname
    if (!path.startsWith("/api/")) {
      const file = Bun.file(join(dist, path === "/" ? "index.html" : path))
      return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
    }
    requests[path] = (requests[path] ?? 0) + 1
    if (path === "/api/event") {
      let active: ReadableStreamDefaultController<Uint8Array>
      return new Response(
        new ReadableStream({
          start(controller) {
            active = controller
            streams.add(controller)
            controller.enqueue(new TextEncoder().encode(": connected\n\n"))
          },
          cancel() {
            streams.delete(active)
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      )
    }
    if (path === "/api/session/active") return json({ data: {} })
    if (path === "/api/project") return json([{ id: "project", time: { created: 1, updated: 1 } }])
    if (path === "/api/fs/list") return json({ location, data: [] })
    if (path === "/api/audio/recording/status")
      return json({
        state: "idle",
        recordingID: null,
        active: false,
        backend: null,
        startedAt: null,
        endedAt: null,
        endReason: null,
        pcmBytes: 0,
        mp3Bytes: 0,
        durationMs: 0,
        progress: "",
        availability: false,
        permission: "unknown",
        environment: "headless",
        errorCode: null,
        errorMessage: null,
        guidance: null,
      } satisfies AudioStatus)
    if (path === "/api/session") return json({ data: sessions, cursor: {} })
    const session = sessions.find((item) => path === `/api/session/${item.id}`)
    if (session) return json({ data: session })
    if (path.endsWith("/message") && path.startsWith("/api/session/")) {
      const id = path.split("/")[3]
      const list = messages(id).toReversed()
      const offset = Number(url.searchParams.get("cursor") ?? 0)
      const limit = Number(url.searchParams.get("limit") ?? 36)
      return json({
        data: list.slice(offset, offset + limit),
        cursor: { next: offset + limit < list.length ? String(offset + limit) : undefined },
      })
    }
    if (path.endsWith("/inbox")) return json({ data: [] })
    if (path === "/api/model/default") return json({ location, data: model })
    if (path === "/api/model") return json({ location, data: [model] })
    if (path === "/api/provider") return json({ location, data: [{ id: "openai", name: "OpenAI", package: "openai" }] })
    if (path === "/api/command") return json({ location, data: [{ name: "review", description: "Review fixture" }] })
    if (path === "/api/skill")
      return json({
        location,
        data: [{ id: "fixture-skill", name: "Fixture skill", path: "/fixture/skill", content: "Review" }],
      })
    if (path === "/api/agent")
      return json({
        location,
        data: [
          {
            id: "explore",
            name: "explore",
            mode: "subagent",
            hidden: false,
            request: { settings: {}, headers: {}, body: {} },
            permissions: [],
          },
          {
            id: "hidden",
            name: "hidden",
            mode: "subagent",
            hidden: true,
            request: { settings: {}, headers: {}, body: {} },
            permissions: [],
          },
          {
            id: "primary",
            name: "primary",
            mode: "primary",
            hidden: false,
            request: { settings: {}, headers: {}, body: {} },
            permissions: [],
          },
        ],
      })
    if (["/api/permission/request", "/api/form"].includes(path)) return json({ location, data: [] })
    errors.push(`${request.method} ${path}`)
    return new Response("Undefined fixture route", { status: 501 })
  },
})
const browser = await chromium.launch({ headless: true, executablePath: process.env.BENCH_BROWSER })
const entries: number[] = []
const switches: number[] = []
const switchClicks: number[] = []
const switchRenders: number[] = []
const streaming: number[] = []
try {
  for (let iteration = 0; iteration < count; iteration++) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, locale: "en-US" })
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === server.url.origin) return route.continue()
      errors.push(`External request blocked: ${route.request().resourceType()}`)
      return route.abort()
    })
    await context.addInitScript(
      ({ id, directory }) => {
        Object.assign(window, {
          api: {
            awaitInitialization: async () => ({
              url: location.origin,
              localAgent: "7777",
              welcomeText: "",
              suggestedQuestions: [],
              storageKeys: {
                sessionID: "opencode.7777.session.id",
                sessionDirectory: "opencode.7777.session.directory",
                promptDraft: "opencode.7777.prompt.draft",
              },
            }),
          },
        })
        localStorage.setItem("opencode.7777.session.id", id)
        localStorage.setItem("opencode.7777.session.directory", directory)
      },
      { id: sessions[0].id, directory },
    )
    const page = await context.newPage()
    page.on("pageerror", (error) => errors.push(error.message))
    const started = performance.now()
    await page.goto(server.url.href)
    await page
      .getByText(`${sessions[0].id} answer 39`, { exact: true })
      .waitFor({ timeout: 15000 })
      .catch(async (error) => {
        console.error({ errors, requests, body: await page.locator("body").innerText() })
        throw error
      })
    entries.push(performance.now() - started)
    await page.evaluate(() => {
      document.title = "Fixture host"
    })
    await page.getByRole("button", { name: "Recent sessions", exact: true }).click()
    const option = page.getByRole("option").filter({ hasText: "Benchmark B" })
    await option.waitFor()
    const switched = performance.now()
    await option.click()
    const clicked = performance.now()
    switchClicks.push(clicked - switched)
    await page.getByText(`${sessions[1].id} answer 39`, { exact: true }).waitFor()
    switches.push(performance.now() - switched)
    switchRenders.push(performance.now() - clicked)
    // The replacement SSE stream must be open before injecting a turn.
    await page.waitForTimeout(100)
    const data = { sessionID: sessions[1].id, assistantMessageID: "msg_live" }
    emit("session.execution.started", { sessionID: sessions[1].id })
    emit("session.step.started", {
      ...data,
      started: 1000 + sequence,
      agent: "7777",
      model: { id: "fixture", providerID: "openai" },
    })
    emit("session.text.started", { ...data, ordinal: 0 })
    const streamed = performance.now()
    for (let index = 0; index < 160; index++) emit("session.text.delta", { ...data, ordinal: 0, delta: "x" })
    emit("session.text.ended", { ...data, ordinal: 0, text: "stream complete" })
    await page.getByText("stream complete", { exact: true }).waitFor()
    streaming.push(performance.now() - streamed)
    if (iteration === 0) {
      await page.screenshot({ path: output.replace(/\.json$/, ".png") })
      if (process.env.BENCH_VERIFY_UI === "true") {
        const scroller = page.locator('[data-slot="session-message-scroller"]')
        const distance = () => scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)
        await expect.poll(distance).toBeLessThan(10)
        await scroller.hover()
        await page.mouse.wheel(0, -600)
        const resume = page.getByRole("button", { name: "Jump to latest", exact: true })
        await expect(resume).toBeVisible()
        const reading = await scroller.evaluate((el) => el.scrollTop)
        emit("session.text.started", { ...data, ordinal: 1 })
        emit("session.text.delta", { ...data, ordinal: 1, delta: "\n\nReading position probe\n\n".repeat(20) })
        await expect(page.getByText("Reading position probe", { exact: true }).first()).toBeAttached()
        // Let delayed layout and the old 250 ms gesture window both settle.
        await page.waitForTimeout(350)
        expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - reading)).toBeLessThan(2)
        await page.screenshot({ path: output.replace(/\.json$/, "-reading.png") })
        await resume.click()
        await expect.poll(distance).toBeLessThan(10)
        await expect(resume).toBeHidden()
        emit("session.text.delta", { ...data, ordinal: 1, delta: "\n\nFollowing position probe\n\n".repeat(20) })
        await expect(page.getByText("Following position probe", { exact: true }).last()).toBeVisible()
        await expect.poll(distance).toBeLessThan(10)
        await page.setViewportSize({ width: 720, height: 600 })
        await expect.poll(distance).toBeLessThan(10)
        await expect(resume).toBeHidden()
        await page.setViewportSize({ width: 1100, height: 800 })
        await expect.poll(distance).toBeLessThan(10)

        await page.getByText("Following position probe", { exact: true }).last().dblclick()
        expect(await page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0)
        const selectionPosition = await scroller.evaluate((el) => el.scrollTop)
        emit("session.text.delta", { ...data, ordinal: 1, delta: "\n\nSelection position probe\n\n".repeat(20) })
        await expect(page.getByText("Selection position probe", { exact: true }).last()).toBeAttached()
        await expect(resume).toBeVisible()
        expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - selectionPosition)).toBeLessThan(2)
        // The control is also usable from the keyboard.
        await resume.focus()
        await page.keyboard.press("Enter")
        await expect.poll(distance).toBeLessThan(10)
        await expect(resume).toBeHidden()

        const editor = page.locator('[contenteditable="true"]').first()
        await editor.fill("/")
        await expect(page.getByText("/review", { exact: true })).toBeVisible()
        await editor.press("Escape")
        await editor.fill("@")
        await expect(page.getByText("@fixture-skill", { exact: true })).toBeVisible()
        await expect(page.getByText("@explore", { exact: true })).toBeVisible()
        await expect(page.getByText("@hidden", { exact: true })).toHaveCount(0)
        await expect(page.getByText("@primary", { exact: true })).toHaveCount(0)
        await editor.press("Escape")
        await editor.fill("")
        await scroller.hover()
        await page.mouse.wheel(0, -600)
        await expect(resume).toBeVisible()
        await page.getByRole("button", { name: "Recent sessions", exact: true }).click()
        await page.getByRole("option").filter({ hasText: "Benchmark A" }).click()
        await expect(page.getByText(`${sessions[0].id} answer 39`, { exact: true })).toBeVisible()
        await expect(page.getByText("stream complete", { exact: true })).toHaveCount(0)
        await expect(resume).toBeHidden()
        await expect.poll(distance).toBeLessThan(10)
        await expect(page.locator("body")).toContainText("9/9")
        if ((await page.title()) !== "Fixture host") throw new Error("The runtime changed the host document title")
      }
    }
    await context.close()
    streams.clear()
  }
  if (errors.length) throw new Error([...new Set(errors)].join("\n"))
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
  }
  const result = {
    runs: count,
    medians: { entry: median(entries), switch: median(switches), streaming: median(streaming) },
    entries,
    switches,
    switchClicks,
    switchRenders,
    streaming,
    requests,
  }
  await Bun.write(output, JSON.stringify(result, null, 2) + "\n")
  console.log(JSON.stringify(result.medians))
} finally {
  await browser.close()
  server.stop(true)
}
