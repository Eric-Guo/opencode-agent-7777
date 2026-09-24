import { expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import type { OpencodeClient } from "@/runtime/server/client-compact"
import { createDefaultSession, restoreSession } from "./session-load-current"

function session(directory: string): SessionInfo {
  return {
    id: "saved-meeting",
    agent: "plm-meeting",
    projectID: "project",
    location: { directory },
    title: "Meeting",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
}

test.each([
  ["/workspace", "/workspace/agent7777", "/workspace/agent-plm-meeting"],
  ["C:\\workspace", "C:\\workspace\\agent7777\\", "C:\\workspace\\agent-plm-meeting"],
])("replaces a saved legacy-folder session under %s without changing it", async (base, legacy, expected) => {
  const previous = session(legacy)
  const requests: unknown[] = []
  const client = {
    location: { get: async () => ({ directory: base }) },
    session: {
      get: async () => previous,
      create: async (input: unknown) => {
        requests.push(input)
        return session(expected)
      },
    },
  } as unknown as OpencodeClient

  const restored = await restoreSession(client, { id: previous.id, directory: legacy })
  expect(restored).toBeUndefined()
  const current = restored ?? (await createDefaultSession(client, "plm-meeting"))

  expect(requests).toEqual([{ agent: "plm-meeting", location: { directory: expected } }])
  expect(current.location.directory).toBe(expected)
  expect(previous.location.directory).toBe(legacy)
})

test.each(["/workspace/agent-plm-meeting", "/workspace/project", "/workspace/agent7777-notes"])(
  "restores the server's current directory %s even when the saved directory is stale",
  async (directory) => {
    const current = session(directory)
    const client = { session: { get: async () => current } } as unknown as OpencodeClient

    expect(await restoreSession(client, { id: current.id, directory: "/workspace/agent7777" })).toEqual(current)
  },
)

test("falls back when the saved session is missing", async () => {
  const client = {
    session: {
      get: async () => {
        throw new Error("Not found")
      },
    },
  } as unknown as OpencodeClient

  expect(await restoreSession(client, undefined)).toBeUndefined()
  expect(await restoreSession(client, { id: "deleted" })).toBeUndefined()
})
