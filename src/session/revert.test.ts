import { afterEach, beforeEach, expect, jest, test } from "bun:test"
import { OpenCode, type SessionInfo, type SessionMessageInfo } from "@opencode/client/promise"
import { prompt } from "@/composer/persistence-singleton"
import { currentRuntime, setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { createComputed, createRoot } from "solid-js"
import { REVERT_TIMEOUT_MS } from "./revert-machine"
import { createSessionRevert as createRevert } from "./revert"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"

browserSuite(import.meta.path, () => {
  const disposers: VoidFunction[] = []
  function createSessionRevert(input: Parameters<typeof createRevert>[0] = {}) {
    return createRoot((dispose) => {
      disposers.push(dispose)
      return createRevert(input)
    })
  }
  const messages = (): SessionMessageInfo[] => [
    { id: "msg_1", type: "user", text: "first prompt", time: { created: 1 } },
    {
      id: "msg_2",
      type: "assistant",
      agent: "7777",
      model: { id: "test", providerID: "test" },
      content: [{ type: "text", text: "first answer" }],
      time: { created: 2, completed: 3 },
    },
    {
      id: "msg_3",
      type: "user",
      text: "second prompt",
      files: [{ name: "notes.txt", mime: "text/plain", data: "aGk=", source: { type: "inline" } }],
      time: { created: 4 },
    },
  ]

  function mockClient(override?: (request: Request) => Promise<Response | undefined>) {
    const requests: { path: string; method: string; body?: unknown }[] = []
    const client = OpenCode.make({
      baseUrl: "http://localhost",
      fetch: (async (input, init) => {
        const request = new Request(input, init)
        const path = new URL(request.url).pathname
        const body = request.method === "POST" ? await request.clone().json() : undefined
        requests.push({ path, method: request.method, body })
        const response = await override?.(request)
        if (response) return response
        if (path.endsWith("/revert/stage")) return Response.json({ data: { messageID: body.messageID } })
        if (path.endsWith("/revert")) return new Response(null, { status: 204 })
        if (path.endsWith("/message"))
          return Response.json({ data: messages(), cursor: { previous: null, next: null } })
        if (path.endsWith("/inbox")) return Response.json({ data: [] })
        throw new Error(`Unexpected request: ${request.method} ${path}`)
      }) as typeof fetch,
    })
    return { client, requests, mutations: () => requests.filter((request) => request.method !== "GET") }
  }

  async function connect(client: ReturnType<typeof mockClient>["client"]) {
    let firstMessages = true
    let firstPending = true
    setSessionClient({
      ...client,
      message: {
        ...client.message,
        list: (input, options) => {
          if (!firstMessages) return client.message.list(input, options)
          firstMessages = false
          return Promise.resolve({ data: messages().toReversed(), cursor: {} })
        },
      },
      session: {
        ...client.session,
        inbox: {
          ...client.session.inbox,
          list: (input, options) => {
            if (!firstPending) return client.session.inbox.list(input, options)
            firstPending = false
            return Promise.resolve([])
          },
        },
      },
    })
    await currentRuntime()!.refreshMessages()
  }

  beforeEach(() => {
    setState({
      status: "ready",
      session: { id: "session", location: { directory: "/repo" } } as SessionInfo,
      sessionMessages: messages(),
      sessionStatus: { type: "idle" },
      messagesLoading: false,
      submitting: false,
      error: "",
    })
    prompt.reset()
  })

  afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    jest.useRealTimers()
    setSessionClient(undefined)
    setState({ session: undefined, sessionMessages: [], error: "", messagesLoading: false, submitting: false })
    prompt.reset()
  })

  test("undo and redo walk user turns, restore attachments, and clear the final boundary", async () => {
    const api = mockClient()
    await connect(api.client)
    const revert = createSessionRevert()
    expect(revert.canUndo()).toBe(true)
    expect(revert.canRedo()).toBe(false)

    await revert.undo()
    expect(state.session?.revert).toEqual({ messageID: "msg_3" })
    expect(prompt.capture()).toEqual({
      prompt: "second prompt",
      attachments: [
        { id: "msg_3:file:0", filename: "notes.txt", mime: "text/plain", url: "data:text/plain;base64,aGk=" },
      ],
    })
    await revert.undo()
    expect(state.session?.revert).toEqual({ messageID: "msg_1" })
    expect(prompt.capture()).toEqual({ prompt: "first prompt", attachments: [] })
    expect(revert.canUndo()).toBe(false)
    await revert.undo()
    expect(api.mutations()).toHaveLength(2)

    await revert.redo()
    expect(state.session?.revert).toEqual({ messageID: "msg_3" })
    expect(prompt.current()).toBe("second prompt")
    await revert.redo()
    expect(state.session?.revert).toBeUndefined()
    expect(prompt.capture()).toEqual({ prompt: "", attachments: [] })
    expect(revert.canRedo()).toBe(false)
    expect(api.mutations()).toEqual([
      { path: "/api/session/session/revert/stage", method: "POST", body: { messageID: "msg_3" } },
      { path: "/api/session/session/revert/stage", method: "POST", body: { messageID: "msg_1" } },
      { path: "/api/session/session/revert/stage", method: "POST", body: { messageID: "msg_3" } },
      { path: "/api/session/session/revert", method: "DELETE", body: undefined },
    ])
    expect(state.sessionMessages).toEqual(messages())
    expect(state.error).toBe("")
  })

  test("timeline revert shares undo/redo and rejects non-user or missing messages", async () => {
    const api = mockClient()
    await connect(api.client)
    const revert = createSessionRevert()
    await revert.to("missing")
    await revert.to("msg_2")
    expect(api.requests).toEqual([])
    await revert.to("msg_1")
    expect(prompt.current()).toBe("first prompt")
    expect(revert.canRedo()).toBe(true)
  })

  test("does not guess a redo target when its boundary is outside loaded history", async () => {
    const api = mockClient()
    await connect(api.client)
    setState("session", "revert", { messageID: "unloaded" })
    const revert = createSessionRevert()
    expect(revert.canUndo()).toBe(false)
    expect(revert.canRedo()).toBe(false)
    await revert.undo()
    await revert.redo()
    setState({ sessionMessages: [], session: { id: "session", location: { directory: "/repo" } } as SessionInfo })
    expect(revert.canUndo()).toBe(false)
    expect(api.requests).toEqual([])
  })

  test.each(["busy", "retry", "submitting", "loading", "offline", "queued", "blocked"])(
    "blocks revert while %s",
    async (condition) => {
      const api = mockClient()
      await connect(api.client)
      if (condition === "busy") setState("sessionStatus", { type: "busy" })
      if (condition === "retry") setState("sessionStatus", { type: "retry", attempt: 1, message: "retry", next: 1 })
      if (condition === "submitting") setState("submitting", true)
      if (condition === "loading") setState("messagesLoading", true)
      if (condition === "offline") setState("status", "failed")
      if (condition === "queued")
        currentRuntime()!.updatePending(() => [
          {
            id: "queued",
            sessionID: "session",
            type: "user",
            payload: { text: "later" },
            delivery: "queue",
            time: { created: 5 },
          },
        ])
      const revert = createSessionRevert({ disabled: () => condition === "blocked" })
      expect(revert.canUndo()).toBe(false)
      await revert.to("msg_1")
      await revert.undo()
      await revert.redo()
      expect(api.requests).toEqual([])
    },
  )

  test.each(["stage", "clear"])("a failed %s preserves the draft and revert boundary", async (action) => {
    const api = mockClient(async () => new Response("Unavailable", { status: 503 }))
    await connect(api.client)
    if (action === "clear") setState("session", "revert", { messageID: "msg_3" })
    prompt.set("unsent draft")
    const revert = createSessionRevert()
    await (action === "stage" ? revert.undo() : revert.redo())
    expect(state.session?.revert).toEqual(action === "stage" ? undefined : { messageID: "msg_3" })
    expect(prompt.current()).toBe("unsent draft")
    expect(state.error).not.toBe("")
    expect(revert.busy()).toBe(false)
  })

  test("serializes requests and preserves a draft changed while waiting", async () => {
    const response = Promise.withResolvers<Response>()
    const api = mockClient((request) => (request.method === "POST" ? response.promise : Promise.resolve(undefined)))
    await connect(api.client)
    const revert = createSessionRevert()
    const pending = revert.undo()
    expect(revert.busy()).toBe(true)
    await revert.undo()
    await revert.to("msg_1")
    prompt.set("new transcription")
    response.resolve(Response.json({ data: { messageID: "msg_3" } }))
    await pending
    expect(api.mutations()).toHaveLength(1)
    expect(prompt.current()).toBe("new transcription")
    expect(state.session?.revert).toEqual({ messageID: "msg_3" })
    expect(revert.busy()).toBe(false)
  })

  test.each(["other", "session"])("ignores a stale response after activating %s", async (id) => {
    const response = Promise.withResolvers<Response>()
    const api = mockClient(() => response.promise)
    await connect(api.client)
    const revert = createSessionRevert()
    const pending = revert.undo()
    setState("session", { id, location: { directory: "/repo" } } as SessionInfo)
    setSessionClient(mockClient().client)
    prompt.set("new session draft")
    response.resolve(Response.json({ data: { messageID: "msg_3" } }))
    await pending
    expect(state.session?.revert).toBeUndefined()
    expect(prompt.current()).toBe("new session draft")
    expect(api.requests).toHaveLength(1)
    expect(revert.busy()).toBe(false)
  })

  test("preserves nested draft edits even when the Solid store retains its array identity", async () => {
    const response = Promise.withResolvers<Response>()
    const api = mockClient((request) => (request.method === "POST" ? response.promise : Promise.resolve(undefined)))
    await connect(api.client)
    prompt.set("before")
    const parts = prompt.store[0].prompt
    const revert = createSessionRevert()
    const pending = revert.undo()
    prompt.store[1]("prompt", 0, { type: "text", content: "after", start: 0, end: 5 })
    expect(prompt.store[0].prompt).toBe(parts)
    response.resolve(Response.json({ data: { messageID: "msg_3" } }))
    await pending
    expect(prompt.current()).toBe("after")
  })

  test("does not report an old session's request failure in the new session", async () => {
    const response = Promise.withResolvers<Response>()
    const api = mockClient(() => response.promise)
    await connect(api.client)
    const pending = createSessionRevert().undo()
    setState("session", { id: "other", location: { directory: "/repo" } } as SessionInfo)
    prompt.set("new draft")
    response.resolve(new Response("Unavailable", { status: 503 }))
    await pending
    expect(state.error).toBe("")
    expect(prompt.current()).toBe("new draft")
  })

  test("keeps a successful revert when the subsequent history refresh fails", async () => {
    const api = mockClient(async (request) =>
      request.method === "GET" ? new Response("Unavailable", { status: 503 }) : undefined,
    )
    await connect(api.client)
    const revert = createSessionRevert()
    await revert.undo()
    expect(state.session?.revert).toEqual({ messageID: "msg_3" })
    expect(prompt.current()).toBe("second prompt")
    expect(state.error).not.toBe("")
    expect(state.messagesLoading).toBe(false)
    expect(revert.busy()).toBe(false)
  })

  test("does not mutate the captured server revert object when later SSE state arrives", async () => {
    const api = mockClient()
    await connect(api.client)
    const original = { messageID: "msg_3", files: [] }
    api.client.session.revert.stage = async () => original
    const revert = createSessionRevert()
    await revert.undo()
    setState("session", "revert", { messageID: "msg_1" })
    expect(original).toEqual({ messageID: "msg_3", files: [] })
  })
  test("the deadline settles a stalled mutation and rejects its late result during retry", async () => {
    const responses = [Promise.withResolvers<Response>(), Promise.withResolvers<Response>()]
    let calls = 0
    const api = mockClient((request) =>
      request.method === "POST" ? responses[calls++].promise : Promise.resolve(undefined),
    )
    await connect(api.client)
    const revert = createSessionRevert()
    prompt.set("keep")
    jest.useFakeTimers()
    const pending = revert.undo()
    jest.advanceTimersByTime(REVERT_TIMEOUT_MS)
    await pending
    expect(revert.busy()).toBe(false)
    expect(state.error).toContain("too long")
    expect(prompt.current()).toBe("keep")
    jest.useRealTimers()
    // Reconciliation is a read, and a retry remains an explicit user action.
    await Bun.sleep(0)
    const retry = revert.undo()
    expect(revert.busy()).toBe(true)
    responses[0].resolve(Response.json({ data: { messageID: "msg_1" } }))
    await Bun.sleep(0)
    expect(revert.busy()).toBe(true)
    expect(state.session?.revert).toBeUndefined()
    expect(prompt.current()).toBe("keep")
    responses[1].resolve(Response.json({ data: { messageID: "msg_3" } }))
    await retry
    expect(state.session?.revert).toEqual({ messageID: "msg_3" })
    expect(revert.busy()).toBe(false)
  })

  test("a deadline during history refresh preserves the committed boundary and shared loading owner", async () => {
    const response = Promise.withResolvers<Response>()
    const api = mockClient((request) => (request.method === "GET" ? response.promise : Promise.resolve(undefined)))
    await connect(api.client)
    const revert = createSessionRevert()
    jest.useFakeTimers()
    const pending = revert.undo()
    // Let the mutation finish and the shared refresh start before its deadline.
    for (let i = 0; i < 30 && !state.session?.revert; i++) await Promise.resolve()
    expect(state.session?.revert).toEqual({ messageID: "msg_3" })
    expect(prompt.current()).toBe("second prompt")
    expect(state.messagesLoading).toBe(true)
    jest.advanceTimersByTime(REVERT_TIMEOUT_MS)
    await pending
    expect(revert.busy()).toBe(false)
    expect(state.messagesLoading).toBe(true)
    expect(state.session?.revert).toEqual({ messageID: "msg_3" })
    expect(prompt.current()).toBe("second prompt")
    jest.useRealTimers()
    response.resolve(new Response("Unavailable", { status: 503 }))
    await Bun.sleep(0)
    expect(state.messagesLoading).toBe(false)
    expect(state.session?.revert).toEqual({ messageID: "msg_3" })
  })

  test.each(["switch", "dispose"] as const)(
    "%s settles the old caller before its transport finishes",
    async (reason) => {
      const response = Promise.withResolvers<Response>()
      await connect(mockClient(() => response.promise).client)
      const revert = createSessionRevert()
      const pending = revert.undo()
      if (reason === "dispose") disposers.at(-1)!()
      else await connect(mockClient().client)
      await pending
      expect(revert.busy()).toBe(false)
      prompt.set("new draft")
      const next = reason === "switch" ? revert.undo() : undefined
      await next
      const boundary = state.session?.revert?.messageID
      response.resolve(Response.json({ data: { messageID: "msg_1" } }))
      await Bun.sleep(0)
      expect(state.session?.revert?.messageID).toBe(boundary)
      expect(state.error).toBe("")
    },
  )
  test("disposal while clearing an error prevents a history mutation from being sent", async () => {
    let calls = 0
    const client = mockClient().client
    client.session.revert.stage = async () => {
      calls++
      return { messageID: "msg_3" }
    }
    await connect(client)
    setState("error", "previous error")
    const revert = createSessionRevert()
    const disposeRevert = disposers.at(-1)!
    const stop = createRoot((dispose) => {
      createComputed(() => {
        if (!state.error) disposeRevert()
      })
      return dispose
    })
    try {
      await revert.undo()
      expect(calls).toBe(0)
      expect(revert.busy()).toBe(false)
      expect(state.session?.revert).toBeUndefined()
    } finally {
      stop()
    }
  })
})
