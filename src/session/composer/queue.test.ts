import { afterEach, beforeEach, expect, test } from "bun:test"
import { OpenCode, type SessionInfo } from "@opencode/client/promise"
import { disposeRefreshQueue } from "@/runtime/server/global-sync/queue-message-refresh"
import { resetPendingEchoes, updatePendingInbox } from "@/runtime/server/global-sync/session-cache-messages"
import { setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { createPromptState, type PromptDraft } from "@/composer/state"
import { buildPromptRequest } from "@/composer/request"
import { createSessionQueue, queuedPromptUndoDraft, type QueuedPrompt } from "./queue"

function makeQueue(input: Partial<Parameters<typeof createSessionQueue>[0]> = {}) {
  return createSessionQueue({
    draft: createPromptState(),
    restoreFocus: () => {},
    working: () => true,
    disabled: () => false,
    ...input,
  })
}

function item(): QueuedPrompt {
  return {
    id: "queued",
    sessionID: "session",
    time: { created: 1 },
    type: "user",
    delivery: "queue",
    payload: { text: "later" },
  }
}

beforeEach(() => {
  setState({ session: { id: "session" } as SessionInfo, error: "", sessionMessages: [] })
  updatePendingInbox(() => [item()])
})

afterEach(() => {
  disposeRefreshQueue()
  resetPendingEchoes()
  setSessionClient(undefined)
  setState({ session: undefined, error: "" })
})

test("uses upstream's default delivery and offers Queue only while work is running", () => {
  let working = false
  const queue = makeQueue({ working: () => working, disabled: () => false })
  expect(queue.delivery()).toBe("steer")
  expect(queue.alternate()).toBeUndefined()
  working = true
  expect(queue.alternate()).toBe("queue")
  expect(queue.count()).toBe(1)
  expect(queue.rows()).toEqual([{ id: "queued", text: "later", attachments: 0 }])
  setState("session", { id: "other" } as SessionInfo)
  expect(queue.rows()).toEqual([])
})

test("applies follow-up preferences only to running turns and offers the opposite shortcut", () => {
  let working = false
  let behavior: "queue" | "steer" = "queue"
  const queue = makeQueue({ working: () => working, disabled: () => false, behavior: () => behavior })
  expect(queue.delivery()).toBe("steer")
  expect(queue.alternate()).toBeUndefined()
  working = true
  expect(queue.delivery()).toBe("queue")
  expect(queue.alternate()).toBe("steer")
  behavior = "steer"
  expect(queue.delivery()).toBe("steer")
  expect(queue.alternate()).toBe("queue")
  working = false
  expect(queue.delivery()).toBe("steer")
  expect(queue.alternate()).toBeUndefined()
})

test.each(["steer", "remove"] as const)("%s uses the server inbox API", async (action) => {
  const requests: unknown[] = []
  const original = item()
  updatePendingInbox(() => [original])
  setSessionClient(
    OpenCode.make({
      baseUrl: "http://localhost",
      fetch: (async (input, init) => {
        const request = new Request(input, init)
        requests.push({
          path: new URL(request.url).pathname,
          method: request.method,
          body: request.method === "PATCH" ? await request.json() : undefined,
        })
        return new Response(null, { status: 204 })
      }) as typeof fetch,
    }),
  )
  const queue = makeQueue({ working: () => true, disabled: () => false })
  await queue[action]("queued")
  expect(requests).toEqual([
    {
      path: "/api/session/session/inbox/queued",
      method: action === "steer" ? "PATCH" : "DELETE",
      body: action === "steer" ? { delivery: "steer" } : undefined,
    },
  ])
  expect(queue.rows()).toEqual([])
  expect(state.sessionPending).toEqual(action === "steer" ? [{ ...item(), delivery: "steer" }] : [])
  expect(original).toEqual(item())
  expect(queue.busy()).toBe(false)
})

test("preserves queued content after a failed action", async () => {
  setSessionClient(
    OpenCode.make({
      baseUrl: "http://localhost",
      fetch: (async (_input, _init) => new Response("Unavailable", { status: 503 })) as typeof fetch,
    }),
  )
  const queue = makeQueue({ working: () => true, disabled: () => false })
  await queue.remove("queued")
  expect(queue.count()).toBe(1)
  expect(state.error).not.toBe("")
  expect(queue.busy()).toBe(false)
})

test("blocks actions while the dock is disabled", async () => {
  let calls = 0
  setSessionClient(
    OpenCode.make({
      baseUrl: "http://localhost",
      fetch: (async (_input, _init) => {
        calls++
        return new Response(null, { status: 204 })
      }) as typeof fetch,
    }),
  )
  const queue = makeQueue({ working: () => true, disabled: () => true })
  await queue.steer("queued")
  await queue.remove("queued")
  expect(calls).toBe(0)
  expect(queue.count()).toBe(1)
})

test("ignores an old session's action result and prevents duplicate actions", async () => {
  const response = Promise.withResolvers<Response>()
  let calls = 0
  setSessionClient(
    OpenCode.make({
      baseUrl: "http://localhost",
      fetch: (async (_input, _init) => {
        calls++
        return response.promise
      }) as typeof fetch,
    }),
  )
  const queue = makeQueue({ working: () => true, disabled: () => false })
  const pending = queue.remove("queued")
  await queue.remove("queued")
  expect(calls).toBe(1)
  setState("session", { id: "other" } as SessionInfo)
  updatePendingInbox(() => [{ ...item(), sessionID: "other" }])
  response.resolve(new Response(null, { status: 204 }))
  await pending
  expect(queue.count()).toBe(1)
  expect(state.sessionPending[0].sessionID).toBe("other")
})

function filePrompt(): QueuedPrompt {
  return {
    ...item(),
    payload: {
      text: "Read @docs/a.txt\n\nKeep the original notes.",
      metadata: { displayText: "Read @docs/a.txt" },
      files: [
        {
          source: { type: "uri", uri: "file:///workspace/docs/a.txt" },
          name: "a.txt",
          mime: "text/plain",
          data: "aGVsbG8=",
          mention: { text: "@docs/a.txt", start: 5, end: 16 },
        },
        { source: { type: "inline" }, name: "photo.png", mime: "image/png", data: "aW1hZ2U=" },
      ],
    },
  }
}

test("undo reconstructs the full prompt with file mentions and inline attachments", () => {
  const original = filePrompt()
  const restored = queuedPromptUndoDraft(original)!
  expect(restored).toEqual({
    prompt: "Read @docs/a.txt\n\nKeep the original notes.",
    references: [
      {
        type: "file",
        path: "docs/a.txt",
        content: "@docs/a.txt",
        start: 5,
        end: 16,
        url: "data:text/plain;base64,aGVsbG8=",
      },
    ],
    attachments: [
      {
        id: "queued:file:1",
        filename: "photo.png",
        mime: "image/png",
        url: "data:image/png;base64,aW1hZ2U=",
      },
    ],
  })
  const draft = createPromptState(restored)
  expect(buildPromptRequest(createPromptState(draft.capture()).capture())).toEqual({
    text: "Read @docs/a.txt\n\nKeep the original notes.",
    files: [
      { uri: "data:text/plain;base64,aGVsbG8=", name: "a.txt", mention: { text: "@docs/a.txt", start: 5, end: 16 } },
      { uri: "data:image/png;base64,aW1hZ2U=", name: "photo.png" },
    ],
  })
  draft.store[1]("prompt", 1, (part) => (part.type === "file" ? { ...part, content: "changed" } : part))
  expect(original).toEqual(filePrompt())
  expect(restored.references?.[0].content).toBe("@docs/a.txt")
})

test.each([
  [-1, 10],
  [5.5, 16],
  [5, 16.5],
  [5, 100],
  [5, 5],
  [0, 11],
])("undo refuses invalid mention offsets %s..%s", (start, end) => {
  const original = filePrompt()
  original.payload.files![0].mention = { text: "@docs/a.txt", start, end }
  expect(queuedPromptUndoDraft(original)).toBeUndefined()
})

test("undo refuses overlapping mentions", () => {
  const original = filePrompt()
  original.payload.files!.push({ ...original.payload.files![0] })
  expect(queuedPromptUndoDraft(original)).toBeUndefined()
})

test("undo appends to the latest draft, persists it, and focuses after server cancellation", async () => {
  const response = Promise.withResolvers<Response>()
  const requests: string[] = []
  setSessionClient(
    OpenCode.make({
      baseUrl: "http://localhost",
      fetch: (async (input, init) => {
        const request = new Request(input, init)
        requests.push(`${request.method} ${new URL(request.url).pathname}`)
        return response.promise
      }) as typeof fetch,
    }),
  )
  const original = filePrompt()
  updatePendingInbox(() => [original])
  const saved: unknown[] = []
  const draft = createPromptState(undefined, (value) => saved.push(value))
  const focused: number[] = []
  const queue = makeQueue({ draft, restoreFocus: (cursor) => focused.push(cursor) })
  const pending = queue.undo("queued")
  expect(queue.busy()).toBe(true)
  expect(queue.undoing()).toBe(true)
  expect(draft.current()).toBe("")
  await queue.undo("queued")
  await queue.steer("queued")
  await queue.remove("queued")
  // Other draft writers can still run while the editor is disabled.
  draft.restore({
    prompt: "@old.txt first",
    references: [{ type: "file", path: "old.txt", content: "@old.txt", start: 0, end: 8 }],
    attachments: [{ id: "old", filename: "old.txt", mime: "text/plain", url: "data:text/plain;base64,b2xk" }],
  })
  response.resolve(new Response(null, { status: 204 }))
  await pending
  expect(requests).toEqual(["DELETE /api/session/session/inbox/queued"])
  const expected: PromptDraft = {
    prompt: "@old.txt first\n\nRead @docs/a.txt\n\nKeep the original notes.",
    references: [
      { type: "file", path: "old.txt", content: "@old.txt", start: 0, end: 8 },
      {
        type: "file",
        path: "docs/a.txt",
        content: "@docs/a.txt",
        start: 21,
        end: 32,
        url: "data:text/plain;base64,aGVsbG8=",
      },
    ],
    attachments: [
      { id: "old", filename: "old.txt", mime: "text/plain", url: "data:text/plain;base64,b2xk" },
      { id: "queued:file:1", filename: "photo.png", mime: "image/png", url: "data:image/png;base64,aW1hZ2U=" },
    ],
  }
  expect(draft.capture()).toEqual(expected)
  expect(saved.at(-1)).toEqual(expected)
  expect(focused).toEqual([expected.prompt.length])
  expect(queue.rows()).toEqual([])
  expect(queue.busy()).toBe(false)
  expect(queue.undoing()).toBe(false)
  expect(original).toEqual(filePrompt())
})

test("undo keeps attachment-only drafts without introducing blank lines", async () => {
  setSessionClient(
    OpenCode.make({
      baseUrl: "http://localhost",
      fetch: (async (_input, _init) => new Response(null, { status: 204 })) as typeof fetch,
    }),
  )
  const draft = createPromptState({
    prompt: "",
    attachments: [{ id: "old", filename: "old.txt", mime: "text/plain", url: "data:text/plain;base64,b2xk" }],
  })
  await makeQueue({ draft }).undo("queued")
  expect(draft.capture()).toEqual({
    prompt: "later",
    attachments: [{ id: "old", filename: "old.txt", mime: "text/plain", url: "data:text/plain;base64,b2xk" }],
  })
})

test.each(["failed", "disabled", "context", "agent", "skill"] as const)(
  "undo preserves the draft and queue when %s",
  async (reason) => {
    let requests = 0
    setSessionClient(
      OpenCode.make({
        baseUrl: "http://localhost",
        fetch: (async (_input, _init) => {
          requests++
          return new Response("Unavailable", { status: 503 })
        }) as typeof fetch,
      }),
    )
    const original = item()
    if (reason === "context")
      original.payload.files = [
        {
          source: { type: "uri", uri: "file:///workspace/context.txt" },
          mime: "text/plain",
          data: "Y29udGV4dA==",
        },
      ]
    if (reason === "agent")
      original.payload.agents = [{ name: "research", mention: { text: "@research", start: 0, end: 9 } }]
    if (reason === "skill") original.payload.skills = [{ id: "skill", name: "review" }]
    updatePendingInbox(() => [original])
    const draft = createPromptState({ prompt: "keep me", attachments: [] })
    const focused: number[] = []
    const queue = makeQueue({
      draft,
      disabled: () => reason === "disabled",
      restoreFocus: (cursor) => focused.push(cursor),
    })
    await queue.undo("queued")
    expect(requests).toBe(reason === "failed" ? 1 : 0)
    expect(draft.capture()).toEqual({ prompt: "keep me", attachments: [] })
    expect(state.sessionPending).toEqual([original])
    expect(focused).toEqual([])
    expect(queue.undoing()).toBe(false)
    if (reason !== "disabled") expect(state.error).not.toBe("")
  },
)

test.each([false, true])("undo ignores results from an old activation (same session: %s)", async (sameSession) => {
  const response = Promise.withResolvers<Response>()
  setSessionClient(
    OpenCode.make({ baseUrl: "http://localhost", fetch: (async (_input, _init) => response.promise) as typeof fetch }),
  )
  const draft = createPromptState({ prompt: "original draft", attachments: [] })
  const queue = makeQueue({ draft })
  const pending = queue.undo("queued")
  setState("session", { id: sameSession ? "session" : "other" } as SessionInfo)
  setSessionClient(OpenCode.make({ baseUrl: "http://localhost" }))
  updatePendingInbox(() => [{ ...item(), sessionID: sameSession ? "session" : "other" }])
  draft.set("new activation draft")
  response.resolve(new Response(null, { status: 204 }))
  await pending
  expect(draft.capture()).toEqual({ prompt: "new activation draft", attachments: [] })
  expect(queue.count()).toBe(1)
  expect(queue.undoing()).toBe(false)
})
