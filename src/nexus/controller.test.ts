import { expect, test } from "bun:test"
import { createChatController, type request } from "./controller"
import type { Connection, Snapshot } from "./chat"

const connection: Connection = {
  scope: "scope",
  workspace: "workspace",
  agent: "rho",
  user: "Human",
  runner: "runner",
  model: "model",
}
const empty = (): Snapshot => ({ turns: [], pending: [], busy: false, decisions: [], problem: null })
class Events extends EventTarget {
  onerror?: () => void
  closed = false
  close() {
    this.closed = true
  }
}
function fixture(handle: (path: string, body?: any) => Promise<unknown>, saved = new Map<string, string>()) {
  const sources: Events[] = []
  const api = (async (path, _scope, body) =>
    path === "/connection" ? connection : handle(path, body)) as typeof request
  const controller = createChatController(
    api,
    () => {
      const e = new Events()
      sources.push(e)
      queueMicrotask(() => e.dispatchEvent(new Event("ready")))
      return e as unknown as EventSource
    },
    {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        saved.set(key, value)
      },
    },
  )
  return { controller, sources }
}
test("retry after a lost creation receipt and a lost input receipt reuses the original keys across reload", async () => {
  const creates: string[] = [],
    inputs: string[] = []
  let prepares = 0
  const storage = new Map<string, string>()
  const handler = async (path: string, body?: any) => {
    if (path === "/chats") {
      creates.push(body.key)
      if (creates.length === 1) throw new Error("lost create receipt")
      return { id: "chat" }
    }
    if (path.endsWith("/prepare")) return { ticket: "prepared-" + ++prepares }
    if (path.endsWith("/inputs")) {
      expect(body.ticket).toBe("prepared-1")
      inputs.push(body.key)
      if (inputs.length === 1) throw new Error("lost input receipt")
      return { id: "input" }
    }
    return empty()
  }
  const first = fixture(handler, storage).controller
  await first.connect()
  first.edit("hello")
  await first.send()
  expect(first.s.error).toBe("lost create receipt")
  await first.send()
  expect(first.s.error).toBe("lost input receipt")
  expect(first.s.draft).toBe("hello")
  first.close()
  const next = fixture(handler, storage).controller
  await next.connect()
  await next.send()
  expect(next.s.draft).toBe("")
  expect(creates).toHaveLength(2)
  expect(inputs).toHaveLength(2)
  expect(prepares).toBe(1)
  expect(creates[0]).toBe(creates[1])
  expect(inputs[0]).toBe(inputs[1])
  expect(inputs[0]).not.toBe(creates[0])
  next.close()
})
test("switch fences late history and frames; reconnect hydrates current pending inputs; Stop targets the current chat", async () => {
  let resume!: (value: unknown) => void
  let snapshot = empty()
  const routes: string[] = []
  const { controller: c, sources } = fixture(async (path) => {
    routes.push(path)
    if (path === "/chats/old")
      return new Promise((resolve) => {
        resume = resolve
      })
    return snapshot
  })
  await c.connect()
  c.select("old")
  c.select("new")
  await Bun.sleep(0)
  resume({ ...empty(), problem: "stale" })
  sources[0].dispatchEvent(
    new MessageEvent("frame", {
      data: JSON.stringify({ type: "text_delta", turn_public_id: "old", variant_public_id: "old", text: "stale" }),
    }),
  )
  expect(sources[0].closed).toBe(true)
  snapshot = { ...empty(), busy: true, pending: [{ id: "pending", text: "waiting", created: 1 }] }
  sources[1].dispatchEvent(new Event("ready"))
  await Bun.sleep(0)
  expect(c.s.snapshot.problem).toBe(null)
  expect(c.s.snapshot.pending[0].text).toBe("waiting")
  expect(c.s.live).toEqual({})
  await c.stop()
  expect(routes).toContain("/chats/new/stop")
  c.close()
})
test("failed workspace access leaves the composer disconnected", async () => {
  const c = createChatController(async () => {
    throw new Error("Nexus: forbidden")
  })
  await c.connect()
  expect(c.s.connection).toBeUndefined()
  expect(c.s.error).toBe("Nexus: forbidden")
  await c.send()
  expect(c.s.id).toBe("")
})
