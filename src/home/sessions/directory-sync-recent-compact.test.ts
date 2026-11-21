import { afterEach, expect, jest, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { createServerSdk } from "@/runtime/server/client-compact"
import { readRetry } from "@/runtime/server/read-errors"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import { setSessionClient, setSessionDraft, setState, state } from "@/runtime/server/session-store-compact"
import { sessionTreeIDs } from "@/session/requests/session-request-tree"
import { refreshRecentSessions } from "./directory-sync-recent-compact"

browserSuite(import.meta.path, () => {
  const originalFetch = globalThis.fetch
  const server = { url: "http://recent.fixture", localAgent: "7777", welcomeText: "", suggestedQuestions: [] }
  const session = (id: string, parentID?: string) => ({ id, parentID, location: { directory: "/repo" } }) as SessionInfo
  const page = (id: string) => Response.json({ data: [session(id, "parent")], cursor: {} })

  function exchange() {
    return { started: Promise.withResolvers<Request>(), response: Promise.withResolvers<Response>() }
  }

  function setup(...reads: ReturnType<typeof exchange>[]) {
    const paths: string[] = []
    globalThis.fetch = (async (input, init) => {
      const request = new Request(input, init)
      paths.push(new URL(request.url).pathname)
      const read = reads.shift()
      if (!read) throw new Error("Unexpected read")
      read.started.resolve(request)
      return read.response.promise
    }) as typeof fetch
    setState("server", server)
    return { client: createServerSdk(server).client, paths }
  }

  afterEach(() => {
    setSessionClient(undefined)
    setState({ server: undefined, session: undefined, recentSessions: [], recentSessionsLoading: false, error: "" })
    globalThis.fetch = originalFetch
    jest.useRealTimers()
  })

  test.each(["success", "failure"])("a superseded %s leaves the latest child sessions available", async (outcome) => {
    const old = exchange()
    const next = exchange()
    const { client } = setup(old, next)
    setSessionClient(client, session("parent"))
    const first = refreshRecentSessions()
    const request = await old.started.promise
    const second = refreshRecentSessions()
    await next.started.promise
    // The active session can receive an equivalent spelling while its directory page is loading.
    setState("session", "location", "directory", "/repo/")
    expect(request.signal.aborted).toBe(true)
    await first
    expect(state.recentSessionsLoading).toBe(true)
    next.response.resolve(page("new-child"))
    await second
    if (outcome === "success") old.response.resolve(page("old-child"))
    else old.response.reject(new Error("obsolete failure"))
    await Bun.sleep(0)
    expect(sessionTreeIDs(state.recentSessions, "parent")).toEqual(["parent", "new-child"])
    expect(state.error).toBe("")
    expect(state.recentSessionsLoading).toBe(false)
  })

  test("a draft retains its last list when response decoding stalls and the banner retries just that read", async () => {
    jest.useFakeTimers()
    const seed = exchange()
    const stalled = exchange()
    const fresh = exchange()
    const { client, paths } = setup(seed, stalled, fresh)
    setSessionDraft(client, "/repo")
    seed.response.resolve(page("saved"))
    await refreshRecentSessions()
    const load = refreshRecentSessions()
    const request = await stalled.started.promise
    const decoding = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
    const stream = new ReadableStream<Uint8Array>({ pull: (body) => decoding.resolve(body) }, { highWaterMark: 0 })
    stalled.response.resolve(new Response(stream, { headers: { "Content-Type": "application/json" } }))
    const body = await decoding.promise
    jest.advanceTimersByTime(30_000)
    expect(request.signal.aborted).toBe(true)
    await load
    expect(state.recentSessions.map((item) => item.id)).toEqual(["saved"])
    expect(state.recentSessionsLoading).toBe(false)
    expect(state.error).toContain("timed out")
    const retry = readRetry()
    expect(retry).toBeFunction()
    jest.useRealTimers()
    fresh.response.resolve(page("fresh"))
    retry!()
    await fresh.started.promise
    await Bun.sleep(0)
    expect(paths).toEqual(["/api/session", "/api/session", "/api/session"])
    expect(state.recentSessions.map((item) => item.id)).toEqual(["fresh"])
    expect(state.error).toBe("")
    expect(readRetry()).toBeUndefined()
    body.enqueue(new TextEncoder().encode(await page("late").text()))
    body.close()
    await Bun.sleep(0)
    expect(state.recentSessions.map((item) => item.id)).toEqual(["fresh"])
  })

  test("leaving and returning to the same session retires the old read and its banner retry", async () => {
    const pending = exchange()
    const failed = exchange()
    const fresh = exchange()
    const { client, paths } = setup(pending, failed, fresh)
    setSessionClient(client, session("parent"))
    const load = refreshRecentSessions()
    const request = await pending.started.promise
    setSessionClient(client, session("other"))
    expect(request.signal.aborted).toBe(true)
    expect(state.recentSessionsLoading).toBe(false)
    await load
    failed.response.resolve(new Response("Recent sessions unavailable", { status: 503 }))
    await refreshRecentSessions()
    const retry = readRetry()
    expect(retry).toBeFunction()
    setSessionClient(client, session("parent"))
    expect(readRetry()).toBeUndefined()
    expect(state.error).toBe("")
    retry!()
    expect(paths).toHaveLength(2)
    fresh.response.resolve(page("current-child"))
    await refreshRecentSessions()
    pending.response.resolve(page("previous-child"))
    await Bun.sleep(0)
    expect(state.recentSessions.map((item) => item.id)).toEqual(["current-child"])
    expect(readRetry()).toBeUndefined()
  })
})
