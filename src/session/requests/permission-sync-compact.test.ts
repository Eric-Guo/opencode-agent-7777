import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { OpenCode, type PermissionRequest, type SessionInfo } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { decidePermission, handlePermissionEvent, refreshPermissions } from "./permission-sync-compact"

const request = {
  id: "permission_test",
  sessionID: "session_child",
  action: "read",
  resources: ["/repo/file.txt"],
} satisfies PermissionRequest

afterEach(() => {
  setSessionClient(undefined)
  setState("session", undefined)
  setState("recentSessions", [])
  setState("permission", reconcile({}))
  setState("permissionResponding", undefined)
  setState("error", "")
})

describe("permission notifications", () => {
  const globals = ["window", "Notification", "localStorage"] as const
  const original = globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const native: { title: string; body?: string }[] = []
  const browser: { title: string; body?: string }[] = []
  let permission: NotificationPermission
  let permissionReads: number
  let requestPermission: () => Promise<NotificationPermission>
  const asked = (value: PermissionRequest = request) =>
    handlePermissionEvent({ id: "event_asked", created: 0, type: "permission.asked", data: value })
  const replied = () =>
    handlePermissionEvent({
      id: "event_replied",
      created: 0,
      type: "permission.replied",
      data: { sessionID: request.sessionID, requestID: request.id, reply: "once" },
    })

  beforeEach(() => {
    native.length = 0
    browser.length = 0
    permission = "granted"
    permissionReads = 0
    requestPermission = async () => "granted"
    class BrowserNotification {
      static get permission() {
        permissionReads++
        return permission
      }
      static requestPermission() {
        return requestPermission()
      }
      constructor(title: string, options?: NotificationOptions) {
        browser.push({ title, body: options?.body })
      }
    }
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: { Notification: BrowserNotification } },
      Notification: { configurable: true, value: BrowserNotification },
      localStorage: { configurable: true, value: { getItem: () => "en" } },
    })
    setState("session", { id: "session_parent", location: { directory: "/repo" } } as SessionInfo)
    setState("recentSessions", [
      { id: request.sessionID, parentID: "session_parent", location: { directory: "/repo" } } as SessionInfo,
    ])
  })

  afterEach(() => {
    replied()
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })

  test.each([
    ["read", "Reading a file (matches the file path)"],
    ["unknown_tool", "Permission required"],
  ])("delivers %s through the desktop host without consulting browser permission", (action, body) => {
    Object.assign(window, {
      api: { showNotification: (title: string, body?: string) => native.push({ title, body }) },
    })
    asked({ ...request, action })

    expect(native).toEqual([{ title: "Permission required", body }])
    expect(browser).toEqual([])
    expect(permissionReads).toBe(0)
  })

  test("notifies only the active tree, suppresses repeated events, and forgets replied IDs", () => {
    asked({ ...request, sessionID: "unrelated" })
    expect(browser).toEqual([])
    asked()
    asked()
    expect(browser).toEqual([{ title: "Permission required", body: "Reading a file (matches the file path)" }])
    replied()
    asked()
    expect(browser).toHaveLength(2)
  })

  test("refresh resets deduplication and notifies the first pending request", async () => {
    setSessionClient(
      OpenCode.make({
        baseUrl: "http://localhost",
        fetch: (async (_input, _init) => Response.json({ data: [request] })) as typeof fetch,
      }),
    )
    asked()
    await refreshPermissions()
    asked()

    expect(browser).toEqual([
      { title: "Permission required", body: "Reading a file (matches the file path)" },
      { title: "Permission required", body: "Reading a file (matches the file path)" },
    ])
    expect(state.permission[request.sessionID]?.map((item) => item.id)).toEqual([request.id])
  })

  test.each(["granted", "denied", "rejected"])("handles a browser permission result of %s", async (result) => {
    permission = "default"
    const pending = Promise.withResolvers<NotificationPermission>()
    let prompts = 0
    requestPermission = () => {
      prompts++
      return pending.promise
    }
    asked()
    asked()
    expect(prompts).toBe(1)
    expect(browser).toEqual([])
    if (result === "rejected") pending.reject(new Error("blocked"))
    else pending.resolve(result as NotificationPermission)
    await Bun.sleep(0)

    expect(browser).toEqual(
      result === "granted" ? [{ title: "Permission required", body: "Reading a file (matches the file path)" }] : [],
    )
  })

  test("does not prompt again after denial and tolerates an unsupported browser", () => {
    permission = "denied"
    requestPermission = () => {
      throw new Error("must not prompt")
    }
    asked()
    expect(browser).toEqual([])
    replied()
    Reflect.deleteProperty(window, "Notification")
    expect(() => asked()).not.toThrow()
    expect(browser).toEqual([])
  })
})

describe("permission sync", () => {
  test.each(["once", "always", "reject"] as const)("sends the %s decision to the owning session", async (decision) => {
    setState("session", { id: "session_parent", location: { directory: "/repo" } } as SessionInfo)
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
