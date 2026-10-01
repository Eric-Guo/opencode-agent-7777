import { afterEach, describe, expect, test } from "bun:test"
import type { SessionInfo as Session } from "@opencode/client/promise"
import { refreshSessionStatus } from "@/runtime/server/global-sync/bootstrap-session"
import { recoverDeletedSession } from "@/session/recovery-compact"
import {
  idleStatus,
  currentRuntime,
  setSessionStatus,
  setSessionClient,
  setState,
  state,
} from "@/runtime/server/session-store-compact"
import type { OpencodeClient } from "@/runtime/server/directory-client-compact"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"

browserSuite(import.meta.path, () => {
  const session = (id = "session", input: Partial<Session> = {}): Session => ({
    id,
    projectID: "project",
    location: { directory: "/repo" },
    title: id,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
    ...input,
  })

  function statusClient(active: Record<string, { type: "running" }>) {
    const requests: unknown[] = []
    const client = {
      session: {
        active: () => {
          requests.push({})
          return Promise.resolve(active)
        },
      },
    } as unknown as OpencodeClient
    return Object.assign(client, { requests })
  }

  afterEach(() => {
    setSessionClient(undefined)
    setState("session", undefined)
    setState("sessionStatus", idleStatus)
  })

  describe("single-session bootstrap status hydration", () => {
    test("does not mutate the shared idle status across transitions", () => {
      setSessionClient(statusClient({}), session())
      setSessionStatus({ type: "retry", attempt: 2, message: "retry", next: 300 })
      setSessionStatus({ type: "busy" })
      expect(state.sessionStatus).toEqual({ type: "busy" })

      expect(idleStatus).toEqual({ type: "idle" })

      setSessionStatus(idleStatus)

      expect(state.sessionStatus).toEqual({ type: "idle" })
    })

    test("ignores old status reads after events and after returning to the same session", async () => {
      const held = Promise.withResolvers<Record<string, { type: "running" }>>()
      const client = { session: { active: () => held.promise } } as unknown as OpencodeClient
      const active = session()
      setSessionClient(client, active)
      const reading = refreshSessionStatus(client, active)
      setSessionStatus({ type: "busy" })
      held.resolve({})
      await reading
      expect(state.sessionStatus).toEqual({ type: "busy" })
      const again = Promise.withResolvers<Record<string, { type: "running" }>>()
      client.session.active = () => again.promise
      const stale = refreshSessionStatus(client, active)
      const previous = currentRuntime()
      setSessionClient(client, session("elsewhere"))
      setSessionClient(client, active)
      expect(previous?.alive()).toBe(false)
      again.resolve({ session: { type: "running" } })
      await stale
      expect(state.sessionStatus).toEqual({ type: "idle" })
    })

    test("seeds the active session status from the server", async () => {
      const activeSession = session()
      const client = statusClient({ [activeSession.id]: { type: "running" } })
      setState("session", activeSession)

      setSessionClient(client, activeSession)
      await refreshSessionStatus(client, activeSession)

      expect(client.requests).toEqual([{}])
      expect(state.sessionStatus).toEqual({ type: "busy" })
    })

    test("falls back to idle when the active session has no server status", async () => {
      const activeSession = session()
      const client = statusClient({})
      setState("session", activeSession)
      setState("sessionStatus", { type: "busy" })

      setSessionClient(client, activeSession)
      await refreshSessionStatus(client, activeSession)

      expect(state.sessionStatus).toEqual(idleStatus)
    })
  })

  describe("deleted session recovery", () => {
    test("opens the parent session when a deleted child has one", async () => {
      const parent = session("parent")
      const child = session("child", { parentID: parent.id })
      const requests: unknown[] = []
      const client = {
        session: {
          get: (input: unknown) => {
            requests.push(input)
            return Promise.resolve(parent)
          },
          create: () => Promise.resolve(session("new")),
        },
        location: {
          get: () => Promise.resolve({ directory: "/home/user", project: { id: "global", directory: "/" } }),
        },
      } as unknown as OpencodeClient

      const result = await recoverDeletedSession(client, child, "7777")

      expect(result.session).toEqual(parent)
      expect(requests).toEqual([{ sessionID: parent.id }])
    })

    test("creates a default session when there is no parent to recover", async () => {
      const next = session("new", { location: { directory: "/home/user" } })
      const client = {
        session: {
          create: () => Promise.resolve(next),
        },
        location: {
          get: () => Promise.resolve({ directory: "/home/user", project: { id: "global", directory: "/" } }),
        },
      } as unknown as OpencodeClient

      const result = await recoverDeletedSession(client, session("child"), "7777")

      expect(result.session).toEqual(next)
    })
  })
})
