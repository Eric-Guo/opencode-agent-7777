import { afterEach, describe, expect, jest, test } from "bun:test"
import {
  OpenCode,
  type FormInfo,
  type PermissionRequest,
  type SessionInfo,
  type OpenCodeEvent,
} from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { handleFormEvent, refreshForms, replyQuestion, rejectQuestion } from "./form-sync-compact"
import { handlePermissionEvent, refreshPermissions, decidePermission } from "./permission-sync-compact"

const session = () => ({ id: "parent", location: { directory: "/repo" } }) as SessionInfo
const permission = (): PermissionRequest => ({ id: "request", sessionID: "child", action: "read", resources: [] })
const question = (): FormInfo => ({
  id: "request",
  sessionID: "child",
  title: "Question",
  fields: [{ key: "choice", type: "string" }],
})

const cases = [
  {
    name: "permission decision",
    kind: "permission",
    send: (id = "request") => decidePermission({ ...permission(), id }, "once"),
  },
  {
    name: "question reply",
    kind: "form",
    send: (id = "request") => replyQuestion({ ...question(), id }, { choice: "yes" }),
  },
  { name: "question dismissal", kind: "form", send: (id = "request") => rejectQuestion({ ...question(), id }) },
] as const

function seed() {
  setState("permission", reconcile({ child: [permission(), { ...permission(), id: "next" }] }))
  setState("form", reconcile({ child: [question(), { ...question(), id: "next" }] }))
}

afterEach(() => {
  jest.useRealTimers()
  setSessionClient(undefined)
  setState("session", undefined)
  setState("permission", reconcile({}))
  setState("form", reconcile({}))
  setState("permissionResponding", undefined)
  setState("questionResponding", undefined)
  setState("error", "")
})

for (const action of cases) {
  describe(action.name, () => {
    const responding = action.kind === "permission" ? "permissionResponding" : "questionResponding"

    test("blocks duplicate replies and preserves the next child request", async () => {
      const held = Promise.withResolvers<Response>()
      const requests: Request[] = []
      setSessionClient(
        OpenCode.make({
          baseUrl: "http://localhost",
          fetch: (async (input, init) => {
            requests.push(new Request(input, init))
            return held.promise
          }) as typeof fetch,
        }),
        session(),
      )
      seed()
      setState("error", "previous failure")

      action.send()
      action.send()
      await Bun.sleep(0)
      expect(requests).toHaveLength(1)
      expect(state[responding]).toBe("request")
      expect(state.error).toBe("")
      expect(state[action.kind].child?.map((item) => item.id)).toEqual(["request", "next"])
      expect(new URL(requests[0].url).pathname).toBe(
        `/api/session/child/${action.kind}/request${action.name === "question dismissal" ? "" : "/reply"}`,
      )
      if (action.name === "question reply") expect(await requests[0].json()).toEqual({ answer: { choice: "yes" } })

      held.resolve(new Response(null, { status: 204 }))
      await Bun.sleep(0)
      expect(state[action.kind].child?.map((item) => item.id)).toEqual(["next"])
      expect(state[responding]).toBeUndefined()
    })

    test("keeps a failed request available for retry", async () => {
      let calls = 0
      setSessionClient(
        OpenCode.make({
          baseUrl: "http://localhost",
          fetch: (async (_input, _init) => {
            if (++calls === 1) return new Response("Unavailable", { status: 503 })
            return new Response(null, { status: 204 })
          }) as typeof fetch,
        }),
        session(),
      )
      seed()

      action.send()
      await Bun.sleep(0)
      expect(state[action.kind].child?.map((item) => item.id)).toEqual(["request", "next"])
      expect(state[responding]).toBeUndefined()
      expect(state.error).not.toBe("")

      action.send()
      await Bun.sleep(0)
      expect(calls).toBe(2)
      expect(state[action.kind].child?.map((item) => item.id)).toEqual(["next"])
      expect(state.error).toBe("")
    })

    test.each([204, 503])(
      "ignores an old activation's %s response after returning to the same session",
      async (status) => {
        const held = Promise.withResolvers<Response>()
        const client = OpenCode.make({
          baseUrl: "http://localhost",
          fetch: ((_input, _init) => held.promise) as typeof fetch,
        })
        setSessionClient(client, session())
        seed()
        action.send()
        setSessionClient(client, { ...session(), id: "elsewhere" })
        setSessionClient(client, session())
        seed()
        setState(responding, "next")
        setState("error", "current activation error")

        held.resolve(new Response(null, { status }))
        await Bun.sleep(0)
        expect(state[action.kind].child?.map((item) => item.id)).toEqual(["request", "next"])
        expect(state[responding]).toBe("next")
        expect(state.error).toBe("current activation error")
      },
    )

    test("refreshing requests cannot release a reply or resurrect an acknowledged request", async () => {
      const held = Promise.withResolvers<Response>()
      let sends = 0
      setSessionClient(
        OpenCode.make({
          baseUrl: "http://localhost",
          fetch: ((input, init) => {
            if (new Request(input, init).method === "GET")
              return Promise.resolve(
                Response.json({ data: action.kind === "permission" ? [permission()] : [question()] }),
              )
            sends++
            return held.promise
          }) as typeof fetch,
        }),
        session(),
      )
      seed()
      action.send()
      const refresh = action.kind === "permission" ? refreshPermissions : refreshForms
      await refresh()
      expect(state[responding]).toBe("request")
      action.send()
      expect(sends).toBe(1)
      if (action.kind === "permission")
        handlePermissionEvent({
          id: "event",
          created: 1,
          type: "permission.replied",
          data: { sessionID: "child", requestID: "request", reply: "once" },
        })
      else
        handleFormEvent({
          id: "event",
          created: 1,
          type: "form.replied",
          data: { sessionID: "child", id: "request", answer: {} },
        })
      await refresh()
      expect(state[action.kind].child ?? []).toEqual([])
      held.resolve(new Response(null, { status: 204 }))
      await Bun.sleep(0)
    })

    test("a stalled reply releases busy state, preserves the answer, and rejects late completion after retry", async () => {
      jest.useFakeTimers()
      const held = Promise.withResolvers<Response>()
      let calls = 0
      setSessionClient(
        OpenCode.make({
          baseUrl: "http://localhost",
          fetch: ((_input, _init) =>
            ++calls === 1 ? held.promise : Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch,
        }),
        session(),
      )
      seed()
      action.send()
      jest.advanceTimersByTime(action.kind === "permission" ? 15_000 : 30_000)
      jest.useRealTimers()
      await Bun.sleep(0)
      expect(state[responding]).toBeUndefined()
      expect(state[action.kind].child?.map((item) => item.id)).toEqual(["request", "next"])
      expect(state.error).toContain("timed out")
      action.send()
      await Bun.sleep(0)
      expect(state[action.kind].child?.map((item) => item.id)).toEqual(["next"])
      held.resolve(new Response(null, { status: 204 }))
      await Bun.sleep(0)
      expect(calls).toBe(2)
      expect(state.error).toBe("")
    })

    test("does not clear a newer pending reply when the old HTTP response arrives", async () => {
      const held = Promise.withResolvers<Response>()
      const next = Promise.withResolvers<Response>()
      let calls = 0
      setSessionClient(
        OpenCode.make({
          baseUrl: "http://localhost",
          fetch: ((_input, _init) => (++calls === 1 ? held.promise : next.promise)) as typeof fetch,
        }),
        session(),
      )
      seed()
      action.send()
      if (action.kind === "permission")
        handlePermissionEvent({
          id: "event",
          created: 1,
          type: "permission.replied",
          data: { sessionID: "child", requestID: "request", reply: "once" },
        } as OpenCodeEvent)
      else
        handleFormEvent({
          id: "event",
          created: 1,
          type: "form.replied",
          data: { sessionID: "child", id: "request", answer: {} },
        } as OpenCodeEvent)
      action.send("next")
      held.resolve(new Response(null, { status: 204 }))
      await Bun.sleep(0)
      expect(state[responding]).toBe("next")
      expect(state[action.kind].child?.map((item) => item.id)).toEqual(["next"])
      next.resolve(new Response(null, { status: 204 }))
      await Bun.sleep(0)
    })
  })
}
