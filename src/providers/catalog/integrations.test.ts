import { afterEach, expect, test } from "bun:test"
import { OpenCode, type ConnectionInfo, type IntegrationInfo, type OpenCodeEvent } from "@opencode/client/promise"
import { createRoot, createSignal } from "solid-js"
import { browserSuite, fixtureData } from "@/runtime/server/runtime.test-fixture"
import { createIntegrationCatalog, usesChatGPTPlan } from "./integrations"

browserSuite(import.meta.path, () => {
  const disposers: VoidFunction[] = []
  afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))
  const oauth: ConnectionInfo = { type: "credential", id: "plan", label: "Plan", method: "oauth" }
  const key: ConnectionInfo = { type: "credential", id: "api", label: "API", method: "key" }
  const integration = (connections: ConnectionInfo[]): IntegrationInfo => ({
    id: "openai",
    name: "OpenAI",
    methods: [],
    connections,
  })

  test.each([
    [undefined, [oauth], false],
    ["anthropic", [oauth], false],
    ["console-openai", [oauth], false],
    ["openai", [], false],
    ["openai", [key, oauth], false],
    ["openai", [{ type: "env", name: "OPENAI_API_KEY" }, oauth], false],
    ["openai", [oauth, key], true],
  ] as [string | undefined, ConnectionInfo[], boolean][])(
    "plan detection uses the selected provider and first active connection (%s, %j)",
    (provider, connections, expected) => {
      expect(usesChatGPTPlan(provider, [integration(connections)])).toBe(expected)
      expect(usesChatGPTPlan(provider, [])).toBe(false)
      expect(usesChatGPTPlan(provider, [{ ...integration(connections), id: "another" }])).toBe(false)
    },
  )

  function fixture() {
    const requests: string[] = []
    const listeners = new Set<(event: OpenCodeEvent) => void>()
    let response = (directory: string): Response | Promise<Response> =>
      Response.json({ location: { directory }, data: [integration([oauth])] })
    const data = fixtureData(
      OpenCode.make({
        baseUrl: "http://fixture.local",
        fetch: (async (input, init) => {
          const url = new URL(new Request(input, init).url)
          expect(url.pathname).toBe("/api/integration")
          const directory = url.searchParams.get("location[directory]")!
          requests.push(directory)
          return response(directory)
        }) as typeof fetch,
      }),
    )
    const result = createRoot((dispose) => {
      disposers.push(dispose)
      const [source, setSource] = createSignal<{ data: typeof data; directory: string }>()
      const catalog = createIntegrationCatalog({
        source,
        events: {
          listen(handler) {
            listeners.add(handler)
            return () => listeners.delete(handler)
          },
        },
      })
      return { dispose, catalog, setSource }
    })
    return {
      ...result,
      data,
      requests,
      listeners,
      open: (directory = "/repo") => result.setSource({ data, directory }),
      close: () => result.setSource(undefined),
      respond: (next: typeof response) => (response = next),
      emit: (type: OpenCodeEvent["type"], directory?: string) =>
        listeners.forEach((handler) =>
          handler({ type, data: {}, ...(directory ? { location: { directory } } : {}) } as OpenCodeEvent),
        ),
    }
  }

  test("loads only an active scope, refreshes on reopening, and disposes its stream listener", async () => {
    const f = fixture()
    await Bun.sleep(0)
    expect(f.requests).toEqual([])
    expect(f.listeners.size).toBe(0)
    f.open()
    await Bun.sleep(0)
    expect(f.requests).toEqual(["/repo"])
    expect(usesChatGPTPlan("openai", f.catalog.list())).toBe(true)
    f.close()
    expect(f.catalog.list()).toEqual([])
    expect(f.listeners.size).toBe(0)
    f.respond((directory) => Response.json({ location: { directory }, data: [integration([key])] }))
    f.open()
    await Bun.sleep(0)
    expect(f.requests).toEqual(["/repo", "/repo"])
    expect(usesChatGPTPlan("openai", f.catalog.list())).toBe(false)
    f.dispose()
    expect(f.listeners.size).toBe(0)
  })

  test("optional failures hide stale plan metadata and recover on reconnect", async () => {
    const f = fixture()
    f.open()
    await Bun.sleep(0)
    expect(usesChatGPTPlan("openai", f.catalog.list())).toBe(true)
    f.respond(() => new Response("Unavailable", { status: 503 }))
    f.emit("credential.updated")
    expect(f.catalog.list()).toEqual([])
    await Bun.sleep(0)
    expect(f.catalog.list()).toEqual([])
    f.respond((directory) => Response.json({ location: { directory }, data: [integration([oauth])] }))
    f.emit("server.connected")
    await Bun.sleep(0)
    expect(usesChatGPTPlan("openai", f.catalog.list())).toBe(true)
    expect(f.requests).toEqual(["/repo", "/repo", "/repo"])
  })

  test("refreshes connection changes while filtering unrelated directory events", async () => {
    const f = fixture()
    f.open()
    await Bun.sleep(0)
    f.emit("integration.updated", "/other")
    f.emit("model.updated", "/repo")
    await Bun.sleep(0)
    expect(f.requests).toEqual(["/repo"])
    for (const type of ["credential.switched", "integration.connection.switched", "integration.updated"] as const) {
      f.emit(type, "/repo")
      await Bun.sleep(0)
    }
    expect(f.requests).toEqual(["/repo", "/repo", "/repo", "/repo"])
  })

  test("an event overtaking a read waits for the refreshed connection before displaying a plan", async () => {
    const f = fixture()
    const old = Promise.withResolvers<Response>()
    const next = Promise.withResolvers<Response>()
    f.respond(() => (f.requests.length === 1 ? old.promise : next.promise))
    f.open()
    await Bun.sleep(0)
    f.emit("credential.updated")
    old.resolve(Response.json({ location: { directory: "/repo" }, data: [integration([oauth])] }))
    await Bun.sleep(0)
    expect(f.requests).toEqual(["/repo", "/repo"])
    expect(f.catalog.list()).toEqual([])
    next.resolve(Response.json({ location: { directory: "/repo" }, data: [integration([key])] }))
    await Bun.sleep(0)
    expect(f.catalog.list()).toEqual([integration([key])])
  })

  test("late reads cannot show the previous workspace's plan or reopen a closed scope", async () => {
    const f = fixture()
    const old = Promise.withResolvers<Response>()
    f.respond((directory) =>
      directory === "/repo" ? old.promise : Response.json({ location: { directory }, data: [integration([key])] }),
    )
    f.open()
    await Bun.sleep(0)
    f.open("/next")
    await Bun.sleep(0)
    expect(f.catalog.list()).toEqual([integration([key])])
    old.resolve(Response.json({ location: { directory: "/repo" }, data: [integration([oauth])] }))
    await Bun.sleep(0)
    expect(f.catalog.list()).toEqual([integration([key])])
    const closing = Promise.withResolvers<Response>()
    f.respond(() => closing.promise)
    f.emit("credential.updated")
    f.close()
    closing.resolve(Response.json({ location: { directory: "/next" }, data: [integration([oauth])] }))
    await Bun.sleep(0)
    expect(f.catalog.list()).toEqual([])
  })
})
