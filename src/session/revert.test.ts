import { afterEach, beforeEach, expect, test } from "bun:test"
import { OpenCode, type SessionInfo, type SessionMessageInfo } from "@opencode/client/promise"
import { prompt } from "@/composer/persistence-singleton"
import { resetPendingEchoes, updatePendingInbox } from "@/runtime/server/global-sync/session-cache-messages"
import { disposeRefreshQueue } from "@/runtime/server/global-sync/queue-message-refresh"
import { setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { createSessionRevert } from "./revert"

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
      if (path.endsWith("/message")) return Response.json({ data: messages(), cursor: { previous: null, next: null } })
      if (path.endsWith("/inbox")) return Response.json({ data: [] })
      throw new Error(`Unexpected request: ${request.method} ${path}`)
    }) as typeof fetch,
  })
  return { client, requests, mutations: () => requests.filter((request) => request.method !== "GET") }
}

beforeEach(() => {
  setState({
    status: "ready",
    session: { id: "session" } as SessionInfo,
    sessionMessages: messages(),
    sessionStatus: { type: "idle" },
    messagesLoading: false,
    submitting: false,
    error: "",
  })
  resetPendingEchoes()
  prompt.reset()
})

afterEach(() => {
  disposeRefreshQueue()
  resetPendingEchoes()
  setSessionClient(undefined)
  setState({ session: undefined, sessionMessages: [], error: "", messagesLoading: false, submitting: false })
  prompt.reset()
})

test("undo and redo walk user turns, restore attachments, and clear the final boundary", async () => {
  const api = mockClient()
  setSessionClient(api.client)
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
  setSessionClient(api.client)
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
  setSessionClient(api.client)
  setState("session", "revert", { messageID: "unloaded" })
  const revert = createSessionRevert()
  expect(revert.canUndo()).toBe(false)
  expect(revert.canRedo()).toBe(false)
  await revert.undo()
  await revert.redo()
  setState({ sessionMessages: [], session: { id: "session" } as SessionInfo })
  expect(revert.canUndo()).toBe(false)
  expect(api.requests).toEqual([])
})

test.each(["busy", "retry", "submitting", "loading", "offline", "queued", "blocked"])(
  "blocks revert while %s",
  async (condition) => {
    const api = mockClient()
    setSessionClient(api.client)
    if (condition === "busy") setState("sessionStatus", { type: "busy" })
    if (condition === "retry") setState("sessionStatus", { type: "retry", attempt: 1, message: "retry", next: 1 })
    if (condition === "submitting") setState("submitting", true)
    if (condition === "loading") setState("messagesLoading", true)
    if (condition === "offline") setState("status", "failed")
    if (condition === "queued")
      updatePendingInbox(() => [
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
  setSessionClient(api.client)
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
  setSessionClient(api.client)
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
  setSessionClient(api.client)
  const revert = createSessionRevert()
  const pending = revert.undo()
  setState("session", { id } as SessionInfo)
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
  setSessionClient(api.client)
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
  setSessionClient(api.client)
  const pending = createSessionRevert().undo()
  setState("session", { id: "other" } as SessionInfo)
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
  setSessionClient(api.client)
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
  setSessionClient(api.client)
  const original = { messageID: "msg_3", files: [] }
  api.client.session.revert.stage = async () => original
  const revert = createSessionRevert()
  await revert.undo()
  setState("session", "revert", { messageID: "msg_1" })
  expect(original).toEqual({ messageID: "msg_3", files: [] })
})
