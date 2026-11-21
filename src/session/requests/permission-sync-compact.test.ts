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
const parent = { id: "session_parent", location: { directory: "/repo" } } as SessionInfo
const child = { id: request.sessionID, parentID: parent.id, location: parent.location } as SessionInfo
const other = { id: "session_other", location: parent.location } as SessionInfo

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
  let deliveryError: Error | undefined
  let requestPermission: () => Promise<NotificationPermission>
  let listed: PermissionRequest[]
  let client: ReturnType<typeof OpenCode.make>
  const delayGrant = () => {
    permission = "default"
    const pending = Promise.withResolvers<NotificationPermission>()
    requestPermission = () => pending.promise
    return async () => {
      pending.resolve("granted")
      await Bun.sleep(0)
    }
  }
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
    deliveryError = undefined
    requestPermission = async () => "granted"
    listed = [request]
    client = OpenCode.make({
      baseUrl: "http://localhost",
      fetch: (async (input, init) => {
        const sent = new Request(input, init)
        if (sent.method === "POST") return new Response(null, { status: 204 })
        return Response.json({ data: listed })
      }) as typeof fetch,
    })
    class BrowserNotification {
      static get permission() {
        permissionReads++
        return permission
      }
      static requestPermission() {
        return requestPermission()
      }
      constructor(title: string, options?: NotificationOptions) {
        if (deliveryError) throw deliveryError
        browser.push({ title, body: options?.body })
      }
    }
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: { Notification: BrowserNotification } },
      Notification: { configurable: true, value: BrowserNotification },
      localStorage: { configurable: true, value: { getItem: () => "en" } },
    })
    setSessionClient(client, parent)
    setState("recentSessions", [child])
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

  test("notifies only the active tree and suppresses repeated or settled events", () => {
    asked({ ...request, sessionID: "unrelated" })
    expect(browser).toEqual([])
    asked()
    asked()
    expect(browser).toEqual([{ title: "Permission required", body: "Reading a file (matches the file path)" }])
    replied()
    asked()
    expect(browser).toHaveLength(1)
    asked({ ...request, id: "next_permission" })
    expect(browser).toHaveLength(2)
  })

  test("greetings keep notification history and announce a newly discovered request", async () => {
    asked()
    await refreshPermissions("greeting")
    listed = [{ ...request, id: "missed", action: "other" }]
    await refreshPermissions("greeting")
    await refreshPermissions("greeting")
    expect(browser.map((notice) => notice.body)).toEqual([
      "Reading a file (matches the file path)",
      "Permission required",
    ])
  })

  test("refresh resets deduplication and notifies the first pending request", async () => {
    asked()
    await refreshPermissions()
    asked()

    expect(browser).toEqual([
      { title: "Permission required", body: "Reading a file (matches the file path)" },
      { title: "Permission required", body: "Reading a file (matches the file path)" },
    ])
    expect(state.permission[request.sessionID]?.map((item) => item.id)).toEqual([request.id])
  })

  test("keeps delivery attempts separate for requests with the same ID in different sessions", async () => {
    const grant = delayGrant()
    asked()
    asked({ ...request, sessionID: parent.id, action: "unknown_tool" })
    replied()
    await grant()
    expect(browser).toEqual([{ title: "Permission required", body: "Permission required" }])
  })

  test.each([
    ["SSE reply", () => replied()],
    [
      "HTTP success",
      async () => {
        decidePermission(request, "once")
        await Bun.sleep(0)
        expect(state.permission[request.sessionID]).toEqual([])
      },
    ],
    [
      "refresh removes the request",
      async () => {
        listed = []
        await refreshPermissions()
        expect(state.permission[request.sessionID]).toBeUndefined()
      },
    ],
    [
      "selection changes before the new activation",
      () => {
        setState("session", undefined)
        setState("session", other)
      },
    ],
    ["child leaves the active tree", () => setState("recentSessions", [])],
    [
      "same session is reactivated",
      () => {
        setSessionClient(client, other)
        setSessionClient(client, parent)
      },
    ],
    ["runtime disposal", () => setSessionClient(undefined)],
  ] as const)("ignores a delayed browser grant after %s", async (_reason, retire) => {
    const grant = delayGrant()
    asked()
    expect(permissionReads).toBeGreaterThan(0)
    await retire()
    await grant()
    expect(browser).toEqual([])
  })

  test("refresh admits a fresh attempt and retires an older grant for the same request", async () => {
    const oldGrant = delayGrant()
    asked()
    const newGrant = delayGrant()
    await refreshPermissions()
    await oldGrant()
    const oldDeliveries = browser.length
    await newGrant()
    asked()
    expect(oldDeliveries).toBe(0)
    expect(browser).toEqual([{ title: "Permission required", body: "Reading a file (matches the file path)" }])
  })

  test("contains delivery errors and leaves the request available for the next refresh", async () => {
    const grant = delayGrant()
    deliveryError = new Error("Notification constructor failed")
    asked()
    await grant()
    deliveryError = undefined
    permission = "granted"
    asked()
    expect(browser).toEqual([])
    expect(state.permission[request.sessionID]?.map((item) => item.id)).toEqual([request.id])
    await refreshPermissions()
    expect(browser).toHaveLength(1)
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
    expect(() => asked({ ...request, id: "next_permission" })).not.toThrow()
    expect(browser).toEqual([])
  })
})

describe("permission sync", () => {
  test.each(["success", "failure"])("ignores a late %s after the session moves directories", async (outcome) => {
    const held = Promise.withResolvers<Response>()
    setSessionClient(
      OpenCode.make({ baseUrl: "http://localhost", fetch: ((_input, _init) => held.promise) as typeof fetch }),
      parent,
    )
    const pending = refreshPermissions("greeting")
    setState("session", "location", "directory", "/new")
    setState("permission", parent.id, [{ ...request, id: "current", sessionID: parent.id }])
    if (outcome === "success") held.resolve(Response.json({ data: [request] }))
    else held.reject(new Error("Old directory failed"))
    await pending
    expect(state.permission[parent.id]?.map((item) => item.id)).toEqual(["current"])
    expect(state.permission[request.sessionID]).toBeUndefined()
  })

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
