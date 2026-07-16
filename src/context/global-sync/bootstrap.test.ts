import { afterEach, describe, expect, test } from "bun:test"
import type { Session } from "@/context/session-directory"
import { refreshSessionStatus } from "@/context/global-sync/bootstrap"
import { recoverDeletedSession } from "@/context/session-recovery"
import { idleStatus, setState, state } from "@/context/server-session"
import type { OpencodeClient } from "@/context/sdk"

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
  setState("session", undefined)
  setState("sessionStatus", idleStatus)
})

describe("bootstrap session status hydration", () => {
  test("seeds the active session status from the server", async () => {
    const activeSession = session()
    const client = statusClient({ [activeSession.id]: { type: "running" } })
    setState("session", activeSession)

    await refreshSessionStatus(client, activeSession)

    expect(client.requests).toEqual([{}])
    expect(state.sessionStatus).toEqual({ type: "busy" })
  })

  test("falls back to idle when the active session has no server status", async () => {
    const activeSession = session()
    const client = statusClient({})
    setState("session", activeSession)
    setState("sessionStatus", { type: "busy" })

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
