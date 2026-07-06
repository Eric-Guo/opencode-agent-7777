import { afterEach, describe, expect, test } from "bun:test"
import type { Session, SessionStatus } from "@opencode-ai/sdk"
import { refreshSessionStatus } from "@/context/global-sync/bootstrap"
import { idleStatus, setState, state } from "@/context/server-session"
import type { OpencodeClient } from "@/context/sdk"

const session = (id = "session"): Session => ({
  id,
  projectID: "project",
  directory: "/repo",
  title: id,
  version: "1",
  time: { created: 1, updated: 1 },
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
