import { afterEach, describe, expect, jest, spyOn, test } from "bun:test"
import { OpenCode, type OpenCodeEvent, type SessionInfo } from "@opencode/client/promise"
import { defaultIdleTimeout } from "@opencode/client/solid"
import { reconcile } from "solid-js/store"
import {
  disposeSessionSync,
  initializeSessionSync,
  restartSessionEventStream,
  sessionEvents,
} from "./sync-session-compact"
import * as resolver from "./resolver-compact"
import * as sessionLoad from "./global-sync/session-load-current"
import * as catalogs from "@/providers/catalog/loader-compact"
import { currentDraft, currentRuntime, setSessionClient, setState, state } from "./session-store-compact"
import { readRetry } from "./read-errors"
import { READ_TIMEOUT_MS } from "./operation"

const originalFetch = globalThis.fetch
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))
const encode = new TextEncoder()

afterEach(() => {
  disposeSessionSync()
  jest.useRealTimers()
  globalThis.fetch = originalFetch
  setState("server", undefined)
  setState("session", undefined)
  setState("form", reconcile({}))
  setState("permission", reconcile({}))
  setState("error", "")
})

async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (check()) return
    await tick()
  }
  throw new Error("Session stream did not reach the expected state")
}

function fixture() {
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          streams.push(controller)
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    )) as unknown as typeof fetch
  setState("server", { url: "http://fixture.test", localAgent: "7777", welcomeText: "", suggestedQuestions: [] })
  setState("session", { id: "session", location: { directory: "/repo" } } as SessionInfo)
  setSessionClient(OpenCode.make({ baseUrl: "http://fixture.test" }), state.session)
  return streams
}

describe("compact session event stream", () => {
  test("a late saved-session result after timeout cannot attach over Retry", async () => {
    jest.useFakeTimers()
    const resolve = spyOn(resolver, "resolveServer").mockResolvedValue({
      url: "http://fixture.test",
      localAgent: "7777",
      welcomeText: "",
      suggestedQuestions: [],
    })
    const held = Promise.withResolvers<SessionInfo>()
    const restore = spyOn(sessionLoad, "restoreSession")
      .mockReturnValueOnce(held.promise)
      .mockRejectedValueOnce(new Error("Retry failed"))
    try {
      const first = initializeSessionSync()
      await until(() => restore.mock.calls.length === 1)
      jest.advanceTimersByTime(READ_TIMEOUT_MS)
      await first
      expect(state.status).toBe("failed")
      expect(restore.mock.calls[0]?.[2]?.aborted).toBe(true)
      readRetry()!()
      await until(() => state.error === "Retry failed")
      held.resolve({ id: "late", location: { directory: "/old" } } as SessionInfo)
      await tick()
      expect(currentRuntime()).toBeUndefined()
      expect(currentDraft()).toBeUndefined()
      expect(state.error).toBe("Retry failed")
    } finally {
      resolve.mockRestore()
      restore.mockRestore()
    }
  })

  test("navigation retires unfinished startup without replacing the new stream or reporting its failure", async () => {
    const server = { url: "http://fixture.test", localAgent: "7777", welcomeText: "", suggestedQuestions: [] }
    const held = Promise.withResolvers<void>()
    const resolve = spyOn(resolver, "resolveServer").mockResolvedValue(server)
    const catalog = spyOn(catalogs, "refreshModels").mockImplementation(() => held.promise)
    globalThis.fetch = (async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname
      if (path === "/api/location") return Response.json({ directory: "/repo" })
      return Response.json({ data: [], cursor: {} })
    }) as typeof fetch
    try {
      const pending = initializeSessionSync()
      await until(() => !!currentDraft())
      const streams = fixture()
      setState("status", "ready")
      restartSessionEventStream()
      await until(() => streams.length === 1)
      streams[0].enqueue(encode.encode(": connected\n\n"))
      await until(() => state.eventsConnected)
      held.reject(new Error("old startup failure"))
      await pending
      expect(state.status).toBe("ready")
      expect(state.error).not.toBe("old startup failure")
      expect(state.eventsConnected).toBe(true)
      expect(streams).toHaveLength(1)
      streams[0].close()
    } finally {
      resolve.mockRestore()
      catalog.mockRestore()
    }
  })

  test("admits form handoffs only after SSE activity and disconnects on EOF", async () => {
    const streams = fixture()
    restartSessionEventStream()
    expect(state.eventsConnected).toBe(false)
    await until(() => streams.length === 1)
    streams[0].enqueue(encode.encode(": connected\n\n"))
    await until(() => state.eventsConnected)
    expect(state.eventsConnected).toBe(true)
    streams[0].close()
    await until(() => !state.eventsConnected)
    expect(state.eventsConnected).toBe(false)
  })

  test("reconnects after EOF and a failed retry, then reconciles pending requests once per greeting", async () => {
    jest.useFakeTimers()
    const streams = fixture()
    const sse = globalThis.fetch
    let calls = 0
    let reads = 0
    let permissionReads = 0
    const permission = { id: "new", sessionID: "session", action: "read", resources: [] }
    const form = {
      id: "missed",
      sessionID: "global",
      title: "MCP input",
      metadata: { kind: "mcp-elicitation" },
      fields: [{ type: "string", key: "answer" }],
    }
    globalThis.fetch = (async (input, init) => {
      const url = new URL(new Request(input, init).url)
      if (url.pathname === "/api/event") {
        if (++calls === 2) throw new Error("Disconnected")
        return sse(input, init)
      }
      if (url.pathname === "/api/permission/request") {
        expect(url.searchParams.get("location[directory]")).toBe("/repo")
        permissionReads++
        return Response.json({ data: [permission] })
      }
      if (url.pathname === "/api/form") {
        expect(url.searchParams.get("location[directory]")).toBe("/repo")
        reads++
        return Response.json({ location: { directory: "/repo" }, data: [form] })
      }
      return Response.json({ data: [], cursor: {} })
    }) as typeof fetch
    setSessionClient(OpenCode.make({ baseUrl: "http://fixture.test", fetch: globalThis.fetch }), state.session)
    restartSessionEventStream()
    await until(() => streams.length === 1)
    streams[0].enqueue(encode.encode(": heartbeat\n\n"))
    await until(() => state.eventsConnected)
    streams[0].close()
    await until(() => !state.eventsConnected)
    jest.advanceTimersByTime(1000)
    await until(() => calls === 2)
    await until(() => !!state.error)
    jest.advanceTimersByTime(2000)
    await until(() => streams.length === 2)
    setState("permission", "session", [{ ...permission, id: "settled-offline" }])
    const greeting = 'data: {"type":"server.connected","data":{}}\n\n'
    streams[1].enqueue(encode.encode(greeting + greeting))
    await until(() => state.form.global?.[0]?.id === "missed")
    expect(state.eventsConnected).toBe(true)
    expect(state.error).toBe("")
    expect(reads).toBe(1)
    expect(permissionReads).toBe(1)
    expect(state.permission.session?.map((item) => item.id)).toEqual(["new"])
    expect(state.form.global?.[0]?.location?.directory).toBe("/repo")
    streams[1].close()
    await until(() => !state.eventsConnected)
    setSessionClient(undefined)
    jest.advanceTimersByTime(60_000)
    await tick()
    expect(calls).toBe(3)
  })

  test("heartbeat bytes extend the stall deadline and a silent connection is replaced", async () => {
    jest.useFakeTimers()
    const streams = fixture()
    restartSessionEventStream()
    await until(() => streams.length === 1)
    const heartbeat = () => streams[0].enqueue(encode.encode(": heartbeat\n\n"))
    heartbeat()
    await until(() => state.eventsConnected)
    jest.advanceTimersByTime(defaultIdleTimeout - 1)
    heartbeat()
    await tick()
    jest.advanceTimersByTime(defaultIdleTimeout - 1)
    expect(state.eventsConnected).toBe(true)
    expect(streams).toHaveLength(1)
    jest.advanceTimersByTime(1)
    await until(() => !state.eventsConnected)
    jest.advanceTimersByTime(1000)
    await until(() => streams.length === 2)
    streams[1].enqueue(encode.encode(": connected\n\n"))
    await until(() => state.eventsConnected)
    disposeSessionSync()
    streams.forEach((stream) => stream.close())
    jest.advanceTimersByTime(2 * defaultIdleTimeout)
    await tick()
    expect(state.eventsConnected).toBe(false)
    expect(streams).toHaveLength(2)
  })

  test("forwards events to listeners and keeps a replacement stream connected", async () => {
    const streams = fixture()
    const received: string[] = []
    const stop = sessionEvents.listen((event) => received.push(event.type))
    try {
      restartSessionEventStream()
      await until(() => streams.length === 1)
      restartSessionEventStream()
      await until(() => streams.length === 2)
      streams[1].enqueue(encode.encode(": connected\n\n"))
      await until(() => state.eventsConnected)
      streams[0].close()
      const event = {
        id: "evt",
        created: 1,
        type: "form.cancelled",
        data: { id: "form", sessionID: "session" },
      } satisfies OpenCodeEvent
      streams[1].enqueue(encode.encode(`data: ${JSON.stringify(event)}\n\n`))
      await until(() => received.length === 1)
      expect(received).toEqual(["form.cancelled"])
      expect(state.eventsConnected).toBe(true)
      stop()
      streams[1].enqueue(encode.encode(`data: ${JSON.stringify(event)}\n\n`))
      streams[1].close()
      await until(() => !state.eventsConnected)
      expect(received).toEqual(["form.cancelled"])
    } finally {
      stop()
    }
  })
})
