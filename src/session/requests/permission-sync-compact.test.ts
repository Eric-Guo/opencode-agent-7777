import { afterEach, describe, expect, test } from "bun:test"
import { OpenCode, type PermissionRequest, type SessionInfo } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { disposeRefreshQueue } from "@/runtime/server/global-sync/queue-message-refresh"
import { setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { decidePermission } from "./permission-sync-compact"

const request = {
  id: "permission_test",
  sessionID: "session_child",
  action: "read",
  resources: ["/repo/file.txt"],
} satisfies PermissionRequest

afterEach(() => {
  disposeRefreshQueue()
  setSessionClient(undefined)
  setState("session", undefined)
  setState("permission", reconcile({}))
  setState("permissionResponding", undefined)
  setState("error", "")
})

describe("permission sync", () => {
  test.each(["once", "always", "reject"] as const)("sends the %s decision to the owning session", async (decision) => {
    setState("session", { id: "session_parent" } as SessionInfo)
    setState("permission", "session_child", [request, { ...request, id: "next_permission" }])
    const replies: unknown[] = []
    setSessionClient(
      OpenCode.make({
        baseUrl: "http://localhost",
        fetch: (async (input, init) => {
          const sent = new Request(input, init)
          replies.push({ path: new URL(sent.url).pathname, method: sent.method, body: await sent.json() })
          return new Response(null, { status: 204 })
        }) as typeof fetch,
      }),
    )

    decidePermission(request, decision)
    await Bun.sleep(0)

    expect(replies).toEqual([
      {
        path: "/api/session/session_child/permission/permission_test/reply",
        method: "POST",
        body: { decision },
      },
    ])
    expect(state.permission.session_child?.map((item) => item.id)).toEqual(["next_permission"])
    expect(state.permissionResponding).toBeUndefined()
    expect(state.error).toBe("")
  })
})
