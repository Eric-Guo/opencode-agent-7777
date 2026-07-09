import { afterEach, describe, expect, test } from "bun:test"
import type { Session, SessionStatus } from "@opencode-ai/sdk"
import { refreshSessionStatus } from "@/context/global-sync/bootstrap"
import { recoverDeletedSession } from "@/context/session-recovery"
import { idleStatus, setState, state } from "@/context/server-session"
import type { OpencodeClient } from "@/context/sdk"

const session = (id = "session", input: Partial<Session> = {}): Session => ({
  id,
  projectID: "project",
  directory: "/repo",
  title: id,
  version: "1",
  time: { created: 1, updated: 1 },
  ...input,
})

function statusClient(statuses: Record<string, SessionStatus>) {
  const requests: unknown[] = []
  const client = {
    session: {
      status: (input: unknown) => {
        requests.push(input)
        return Promise.resolve({ data: statuses })
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
    const client = statusClient({ [activeSession.id]: { type: "busy" } })
    setState("session", activeSession)

    await refreshSessionStatus(client, activeSession)

    expect(client.requests).toEqual([{ query: { directory: "/repo" } }])
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
          return Promise.resolve({ data: parent })
        },
        create: () => Promise.resolve({ data: session("new") }),
      },
      path: {
        get: () => Promise.resolve({ data: { home: "/home/user" } }),
      },
    } as unknown as OpencodeClient

    const result = await recoverDeletedSession(client, child)

    expect(result.session).toEqual(parent)
    expect(requests).toEqual([{ path: { id: parent.id }, query: { directory: "/repo" } }])
  })

  test("creates a default session when there is no parent to recover", async () => {
    const next = session("new", { directory: "/home/user" })
    const client = {
      session: {
        create: () => Promise.resolve({ data: next }),
      },
      path: {
        get: () => Promise.resolve({ data: { home: "/home/user" } }),
      },
    } as unknown as OpencodeClient

    const result = await recoverDeletedSession(client, session("child"))

    expect(result.session).toEqual(next)
  })
})
