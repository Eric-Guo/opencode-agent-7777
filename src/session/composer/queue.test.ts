import { afterEach, beforeEach, expect, test } from "bun:test"
import { OpenCode, type SessionInfo } from "@opencode/client/promise"
import { disposeRefreshQueue } from "@/runtime/server/global-sync/queue-message-refresh"
import { resetPendingEchoes, updatePendingInbox } from "@/runtime/server/global-sync/session-cache-messages"
import { setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { createSessionQueue, type QueuedPrompt } from "./queue"

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
  const queue = createSessionQueue({ working: () => working, disabled: () => false })
  expect(queue.delivery()).toBe("steer")
  expect(queue.alternate()).toBeUndefined()
  working = true
  expect(queue.alternate()).toBe("queue")
  expect(queue.count()).toBe(1)
  expect(queue.rows()).toEqual([{ id: "queued", text: "later", attachments: 0 }])
  setState("session", { id: "other" } as SessionInfo)
  expect(queue.rows()).toEqual([])
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
  const queue = createSessionQueue({ working: () => true, disabled: () => false })
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
  const queue = createSessionQueue({ working: () => true, disabled: () => false })
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
  const queue = createSessionQueue({ working: () => true, disabled: () => true })
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
  const queue = createSessionQueue({ working: () => true, disabled: () => false })
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
