import { afterEach, expect, jest, test } from "bun:test"
import { OpenCode, type FormInfo, type PermissionRequest, type SessionInfo } from "@opencode/client/promise"
import { createRoot } from "solid-js"
import { reconcile } from "solid-js/store"
import { readRetry } from "@/runtime/server/read-errors"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import { currentRuntime, setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { handleFormEvent } from "./form-sync-compact"
import { createSessionRequestModel } from "./model"
import { handlePermissionEvent } from "./permission-sync-compact"

const session = (id: string, parentID?: string, directory = "/fixture"): SessionInfo => ({
  id,
  parentID,
  location: { directory },
  projectID: "project",
  title: id,
  agent: "7777",
  time: { created: 1, updated: 1 },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
})
const permission = (id: string, sessionID = id): PermissionRequest => ({ sessionID, id, action: "read", resources: [] })
const question = (sessionID: string) =>
  ({
    id: "form",
    sessionID,
    title: "Question",
    fields: [{ key: "choice", type: "string" }],
    metadata: { kind: "question" },
  }) satisfies FormInfo
const ask = (id: string) => handlePermissionEvent({ id, created: 1, type: "permission.asked", data: permission(id) })
const settle = (id: string) =>
  handlePermissionEvent({
    id,
    created: 2,
    type: "permission.replied",
    data: { sessionID: id, requestID: id, reply: "once" },
  })
const form = (id: string) =>
  handleFormEvent({
    id,
    created: 1,
    type: "form.created",
    data: { form: question(id) },
  })
const flush = () => Bun.sleep(0)

browserSuite(import.meta.path, () => {
  let dispose: (() => void) | undefined
  const original = Object.getOwnPropertyDescriptor(globalThis, "window")

  function fixture(get: (id: string, signal: AbortSignal) => Promise<SessionInfo>) {
    const notifications: string[] = []
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        api: { showNotification: (title: string) => notifications.push(title) },
      },
    })
    const calls: string[] = []
    const api = OpenCode.make({ baseUrl: "http://fixture" })
    api.session.get = ({ sessionID }, options) => {
      calls.push(sessionID)
      return get(sessionID, options!.signal!)
    }
    setSessionClient(api, session("root"))
    setState(
      "recentSessions",
      Array.from({ length: 12 }, (_, i) => session("recent-" + i)),
    )
    const model = createRoot((stop) => {
      dispose = stop
      return createSessionRequestModel()
    })
    return { model, calls, notifications, api }
  }

  afterEach(() => {
    dispose?.()
    setSessionClient(undefined)
    setState("session", undefined)
    setState("recentSessions", [])
    setState("permission", reconcile({}))
    setState("form", reconcile({}))
    setState("error", "")
    jest.useRealTimers()
    if (original) Object.defineProperty(globalThis, "window", original)
    else Reflect.deleteProperty(globalThis, "window")
  })

  test("routes older descendants across a shared missing ancestor while known requests remain actionable", async () => {
    const parent = Promise.withResolvers<SessionInfo>()
    const f = fixture(async (id) => (id === "older" ? parent.promise : session(id, "older")))
    ask("leaf")
    form("sibling")
    form("leaf")
    await flush()
    expect(f.calls.toSorted()).toEqual(["leaf", "older", "sibling"])
    expect(f.model.blocked()).toBe(false)
    ask("root")
    expect(f.model.permissionRequest()?.id).toBe("root")
    settle("root")
    parent.resolve(session("older", "root"))
    await flush()
    expect(f.model.permissionRequest()?.sessionID).toBe("leaf")
    expect(f.model.questionRequest()?.id).toBe("form")
    expect(f.notifications).toHaveLength(2)
    ask("older")
    expect(f.model.permissionRequest()?.sessionID).toBe("older")
    expect(f.calls.toSorted()).toEqual(["leaf", "older", "sibling"])
    expect(state.recentSessions.map((item) => item.id)).toEqual(Array.from({ length: 12 }, (_, i) => "recent-" + i))
  })

  test("known owners need no reads and unrelated, missing and cyclic chains cannot prompt", async () => {
    const f = fixture(async (id) => {
      if (id === "missing") throw { _tag: "SessionNotFoundError", sessionID: id }
      return session(id, id === "cycle" ? "loop" : id === "loop" ? "cycle" : undefined)
    })
    setState("recentSessions", [session("known", "root"), session("foreign")])
    ask("known")
    expect(f.model.permissionRequest()?.id).toBe("known")
    settle("known")
    for (const id of ["foreign", "unknown-root", "missing", "cycle"]) ask(id)
    await flush()
    expect(f.calls.toSorted()).toEqual(["cycle", "loop", "missing", "unknown-root"])
    expect(f.model.blocked()).toBe(false)
    expect(f.notifications).toHaveLength(1)
    expect(state.error).toBe("")
  })

  test("holds the directory-wide form while resolving a possible child and restores it after the child settles", async () => {
    const parent = Promise.withResolvers<SessionInfo>()
    const { model, calls } = fixture(() => parent.promise)
    const global = { ...question("global"), metadata: { kind: "mcp-elicitation" } }
    handleFormEvent({
      id: "directory",
      created: 1,
      type: "form.created",
      location: { directory: "/fixture" },
      data: { form: global },
    })
    const first = model.elicitationRequest()
    expect(first?.sessionID).toBe("global")
    form("child")
    expect(model.elicitationRequest()).toBeUndefined()
    parent.resolve(session("child", "root"))
    await flush()
    expect(calls).toEqual(["child"])
    expect(model.questionRequest()?.sessionID).toBe("child")
    expect(model.elicitationRequest()).toBeUndefined()
    handleFormEvent({ id: "done", created: 2, type: "form.cancelled", data: { id: "form", sessionID: "child" } })
    expect(model.elicitationRequest()).toBe(first)
  })

  test("settling and switching away and back retire reads even if the client ignores cancellation", async () => {
    const held = Promise.withResolvers<SessionInfo>()
    const signals: AbortSignal[] = []
    const f = fixture(async (id, signal) => {
      signals.push(signal)
      await held.promise
      return session(id, "root")
    })
    ask("settled")
    settle("settled")
    ask("old")
    setSessionClient(f.api, session("other"))
    setState("permission", reconcile({}))
    setSessionClient(f.api, session("root"))
    held.resolve(session("ignored"))
    await flush()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(f.model.blocked()).toBe(false)
    expect(f.notifications).toEqual([])
    expect(state.error).toBe("")
  })

  test("an ancestor deletion retires its pending read and keeps the child out of the dock", async () => {
    const held = Promise.withResolvers<SessionInfo>()
    const f = fixture(async (id) => (id === "parent" ? held.promise : session(id, "parent")))
    ask("leaf")
    await flush()
    expect(f.calls).toEqual(["leaf", "parent"])
    currentRuntime()!.requestAncestry.removed("parent")
    held.resolve(session("parent", "root"))
    await flush()
    expect(f.model.blocked()).toBe(false)
    expect(f.notifications).toEqual([])
    expect(state.error).toBe("")
  })

  test("settling a sibling keeps the shared parent lookup alive for the other request", async () => {
    const parent = Promise.withResolvers<SessionInfo>()
    const f = fixture(async (id) => (id === "parent" ? parent.promise : session(id, "parent")))
    ask("sibling")
    form("leaf")
    await flush()
    settle("sibling")
    parent.resolve(session("parent", "root"))
    await flush()
    expect(f.calls.toSorted()).toEqual(["leaf", "parent", "sibling"])
    expect(f.model.permissionRequest()).toBeUndefined()
    expect(f.model.questionRequest()?.sessionID).toBe("leaf")
    expect(f.notifications).toEqual([])
  })

  test("a late recent page resolves a failed lookup and retires its Retry action", async () => {
    const f = fixture(async () => {
      throw new Error("Session read failed")
    })
    ask("leaf")
    await flush()
    expect(state.error).toBe("Session read failed")
    const retry = readRetry()!
    setState("recentSessions", [session("leaf", "root")])
    expect(f.model.permissionRequest()?.sessionID).toBe("leaf")
    expect(f.notifications).toHaveLength(1)
    expect(state.error).toBe("")
    retry()
    expect(f.calls).toEqual(["leaf"])
  })

  test("the entire chain shares a deadline and Retry ignores the abandoned parent read", async () => {
    jest.useFakeTimers()
    const leaf = Promise.withResolvers<SessionInfo>()
    const parent = Promise.withResolvers<SessionInfo>()
    const readingParent = Promise.withResolvers<void>()
    let first = true
    const f = fixture(async (id) => {
      if (id === "leaf") return leaf.promise
      if (!first) return session("parent", "root")
      first = false
      readingParent.resolve()
      return parent.promise
    })
    ask("leaf")
    jest.advanceTimersByTime(25_000)
    leaf.resolve(session("leaf", "parent"))
    await readingParent.promise
    expect(f.calls).toEqual(["leaf", "parent"])
    jest.advanceTimersByTime(5_000)
    jest.useRealTimers()
    expect(state.error).toContain("timed out")
    expect(f.model.blocked()).toBe(false)
    expect(readRetry()).toBeFunction()
    readRetry()!()
    await flush()
    expect(f.model.permissionRequest()?.sessionID).toBe("leaf")
    parent.resolve(session("parent", "elsewhere"))
    await flush()
    expect(f.model.permissionRequest()?.sessionID).toBe("leaf")
    expect(f.calls).toEqual(["leaf", "parent", "parent"])
    expect(f.notifications).toHaveLength(1)
    expect(state.error).toBe("")
  })
})
