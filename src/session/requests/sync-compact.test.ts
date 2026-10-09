import { afterEach, describe, expect, test } from "bun:test"
import { OpenCode, type FormInfo, type PermissionRequest, type SessionInfo } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { replyQuestion, rejectQuestion } from "./form-sync-compact"
import { decidePermission } from "./permission-sync-compact"

const session = () => ({ id: "parent", location: { directory: "/repo" } }) as SessionInfo
const permission = (): PermissionRequest => ({ id: "request", sessionID: "child", action: "read", resources: [] })
const question = (): FormInfo => ({
  id: "request",
  sessionID: "child",
  title: "Question",
  fields: [{ key: "choice", type: "string" }],
})

const cases = [
  { name: "permission decision", kind: "permission", send: () => decidePermission(permission(), "once") },
  { name: "question reply", kind: "form", send: () => replyQuestion(question(), { choice: "yes" }) },
  { name: "question dismissal", kind: "form", send: () => rejectQuestion(question()) },
] as const

function seed() {
  setState("permission", reconcile({ child: [permission(), { ...permission(), id: "next" }] }))
  setState("form", reconcile({ child: [question(), { ...question(), id: "next" }] }))
}

afterEach(() => {
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

    test("does not clear a newer pending reply when the old HTTP response arrives", async () => {
      const held = Promise.withResolvers<Response>()
      setSessionClient(
        OpenCode.make({ baseUrl: "http://localhost", fetch: ((_input, _init) => held.promise) as typeof fetch }),
        session(),
      )
      seed()
      action.send()
      // An SSE acknowledgement can release the dock before the HTTP response arrives.
      setState(responding, "next")
      held.resolve(new Response(null, { status: 204 }))
      await Bun.sleep(0)
      expect(state[responding]).toBe("next")
      expect(state[action.kind].child?.map((item) => item.id)).toEqual(["next"])
    })
  })
}
