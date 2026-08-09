import { afterEach, describe, expect, test } from "bun:test"
import type { SessionInfo as Session, SessionMessageInfo } from "@opencode-ai/client/promise"
import { loadRecentMessageWindow, refreshMessages } from "@/context/global-sync/session-cache-messages"
import { setSessionClient, setState, state } from "@/context/server-session-store"
import type { OpencodeClient } from "@/context/server-sdk-client"

const session = (id = "session"): Session => ({
  id,
  projectID: "project",
  location: { directory: "/repo" },
  title: id,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
})

const messages: SessionMessageInfo[] = [
  {
    id: "msg_user",
    type: "user",
    time: { created: 1 },
    text: "hello",
  },
  {
    id: "msg_assistant",
    type: "assistant",
    time: { created: 2, completed: 3 },
    agent: "7777",
    model: { id: "model", providerID: "provider" },
    content: [
      { type: "reasoning", text: "thinking", time: { created: 2, completed: 2 } },
      { type: "text", text: "answer" },
    ],
  },
]

function messageClient(data: SessionMessageInfo[]) {
  const requests: unknown[] = []
  const client = {
    message: {
      list: (input: unknown) => {
        requests.push(input)
        return Promise.resolve({ data, cursor: { previous: null, next: null } })
      },
    },
  } as unknown as OpencodeClient
  return Object.assign(client, { requests })
}

function pagedMessageClient(pages: Record<string, { data: SessionMessageInfo[]; next?: string }>) {
  const requests: unknown[] = []
  const client = {
    message: {
      list: (input: { cursor?: string }) => {
        requests.push(input)
        const page = pages[input.cursor ?? "first"] ?? { data: [] }
        return Promise.resolve({ data: page.data, cursor: { previous: undefined, next: page.next } })
      },
    },
  } as unknown as OpencodeClient
  return Object.assign(client, { requests })
}

afterEach(() => {
  setSessionClient(undefined)
  setState("session", undefined)
  setState("sessionMessages", [])
  setState("messages", [])
  setState("messagesLoading", false)
})

describe("single-session message cache", () => {
  test("follows older cursors until the bounded dialog window is hydrated", async () => {
    const newer = [
      { id: "user-3", type: "user", text: "third", time: { created: 5 } },
      {
        id: "assistant-3",
        type: "assistant",
        agent: "7777",
        model: { id: "model", providerID: "provider" },
        content: [{ type: "text", text: "third answer" }],
        time: { created: 6 },
      },
    ] satisfies SessionMessageInfo[]
    const older = [
      { id: "user-1", type: "user", text: "first", time: { created: 1 } },
      { id: "user-2", type: "user", text: "second", time: { created: 3 } },
    ] satisfies SessionMessageInfo[]
    const client = pagedMessageClient({
      first: { data: newer.toReversed(), next: "older" },
      older: { data: older.toReversed(), next: "oldest" },
      oldest: { data: [], next: "oldest" },
    })

    const result = await loadRecentMessageWindow({ client, sessionID: "session", limit: 2, dialogLimit: 3 })

    expect(client.requests).toEqual([
      { sessionID: "session", limit: 2, order: "desc" },
      { sessionID: "session", limit: 2, cursor: "older" },
    ])
    expect(result.map((message) => message.id)).toEqual(["user-1", "user-2", "user-3", "assistant-3"])
  })

  test("stops cursor loading when history is exhausted before the dialog limit", async () => {
    const client = pagedMessageClient({
      first: { data: messages.toReversed(), next: "older" },
      older: { data: [], next: "older" },
    })

    const result = await loadRecentMessageWindow({ client, sessionID: "session", limit: 20, dialogLimit: 9 })

    expect(client.requests).toEqual([
      { sessionID: "session", limit: 20, order: "desc" },
      { sessionID: "session", limit: 20, cursor: "older" },
    ])
    expect(result.map((message) => message.id)).toEqual(["msg_user", "msg_assistant"])
  })

  test("projects current session messages into the timeline model", async () => {
    const client = messageClient(messages.toReversed())
    setSessionClient(client)
    setState("session", session())

    await refreshMessages(20)

    expect(client.requests).toEqual([{ sessionID: "session", limit: 20, order: "desc" }])
    expect(state.sessionMessages.map((message) => message.id)).toEqual(["msg_user", "msg_assistant"])
    expect(state.messages.map((item) => item.info.id)).toEqual(["msg_user", "msg_assistant"])
    expect(state.messages[0]?.info).toMatchObject({
      role: "user",
      agent: "7777",
      model: { providerID: "provider", modelID: "model" },
    })
    expect(state.messages[1]?.info).toMatchObject({ role: "assistant", parentID: "msg_user" })
    expect(state.messages[1]?.parts.map((part) => part.type)).toEqual(["reasoning", "text"])
  })

  test("does not apply a response after the active session changes", async () => {
    const client = messageClient(messages)
    setSessionClient(client)
    setState("session", session())
    const refresh = refreshMessages(20)
    setState("session", session("other"))

    await refresh

    expect(state.sessionMessages).toEqual([])
    expect(state.messages).toEqual([])
  })
})
