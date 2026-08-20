import { afterEach, describe, expect, test } from "bun:test"
import type { SessionInboxInfo, SessionInfo as Session, SessionMessageInfo } from "@opencode-ai/client/promise"
import {
  inboxItemMessage,
  loadRecentMessageWindow,
  mergeInboxMessages,
  refreshMessages,
  resetPendingEchoes,
} from "@/context/global-sync/session-cache-messages"
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

function messageClient(data: SessionMessageInfo[], inbox: SessionInboxInfo[] = []) {
  const requests: unknown[] = []
  const client = {
    message: {
      list: (input: unknown) => {
        requests.push(input)
        return Promise.resolve({ data, cursor: { previous: null, next: null } })
      },
    },
    session: {
      inbox: {
        list: () => Promise.resolve(inbox),
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
  setState("messagesLoading", false)
  resetPendingEchoes()
})

const userMessage = (id: string, created: number, text: string): SessionMessageInfo => ({
  id,
  type: "user",
  text,
  time: { created },
})

const inboxUser = (id: string, timeCreated: number, text: string): SessionInboxInfo => ({
  id,
  sessionID: "ses_test",
  timeCreated,
  type: "user",
  payload: { text },
  delivery: "steer",
})

describe("inboxItemMessage", () => {
  test("maps a user inbox item to a user message", () => {
    expect(inboxItemMessage(inboxUser("msg_1", 1000, "hello"))).toEqual({
      id: "msg_1",
      type: "user",
      metadata: undefined,
      text: "hello",
      files: undefined,
      agents: undefined,
      skills: undefined,
      time: { created: 1000 },
    })
  })

  test("maps a synthetic inbox item with description", () => {
    const item: SessionInboxInfo = {
      id: "msg_2",
      sessionID: "ses_test",
      timeCreated: 2000,
      type: "synthetic",
      payload: { text: "note", description: "compaction" },
      delivery: "queue",
    }
    expect(inboxItemMessage(item)).toEqual({
      id: "msg_2",
      type: "synthetic",
      metadata: undefined,
      text: "note",
      description: "compaction",
      time: { created: 2000 },
    })
  })

  test("ignores non-message inbox items", () => {
    const item: SessionInboxInfo = {
      id: "msg_3",
      sessionID: "ses_test",
      timeCreated: 3000,
      type: "compaction",
      payload: {},
      delivery: "steer",
    }
    expect(inboxItemMessage(item)).toBeUndefined()
  })
})

describe("mergeInboxMessages", () => {
  test("unions delivered, admitted, and echoed messages in chronological order", () => {
    const merged = mergeInboxMessages({
      delivered: [userMessage("msg_2", 2000, "delivered")],
      admitted: [inboxUser("msg_3", 3000, "admitted")],
      echoes: [userMessage("msg_1", 1000, "echo")],
    })
    expect(merged.map((message) => message.id)).toEqual(["msg_1", "msg_2", "msg_3"])
  })

  test("delivered messages win over admitted items and echoes with the same id", () => {
    const merged = mergeInboxMessages({
      delivered: [userMessage("msg_1", 1000, "delivered")],
      admitted: [inboxUser("msg_1", 1000, "admitted")],
      echoes: [userMessage("msg_1", 1000, "echo")],
    })
    expect(merged).toEqual([userMessage("msg_1", 1000, "delivered")])
  })

  test("admitted items win over echoes with the same id", () => {
    const merged = mergeInboxMessages({
      delivered: [],
      admitted: [inboxUser("msg_1", 1000, "admitted")],
      echoes: [userMessage("msg_1", 1000, "echo")],
    })
    expect(merged).toEqual([
      {
        id: "msg_1",
        type: "user",
        metadata: undefined,
        text: "admitted",
        files: undefined,
        agents: undefined,
        skills: undefined,
        time: { created: 1000 },
      },
    ])
  })
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

  test("loads current session messages for the timeline", async () => {
    const client = messageClient(messages.toReversed())
    setSessionClient(client)
    setState("session", session())

    await refreshMessages(20)

    expect(client.requests).toEqual([{ sessionID: "session", limit: 20, order: "desc" }])
    expect(state.sessionMessages.map((message) => message.id)).toEqual(["msg_user", "msg_assistant"])
    expect(state.sessionMessages[0]).toMatchObject({ type: "user", text: "hello" })
    expect(state.sessionMessages[1]).toMatchObject({
      type: "assistant",
      content: [{ type: "reasoning" }, { type: "text" }],
    })
  })

  test("keeps admitted-but-undelivered inbox items through message-list refreshes", async () => {
    const client = messageClient(messages.toReversed(), [inboxUser("msg_pending", 4000, "queued while busy")])
    setSessionClient(client)
    setState("session", session())

    await refreshMessages(20)

    expect(state.sessionMessages.map((message) => message.id)).toEqual(["msg_user", "msg_assistant", "msg_pending"])
  })

  test("does not apply a response after the active session changes", async () => {
    const client = messageClient(messages)
    setSessionClient(client)
    setState("session", session())
    const refresh = refreshMessages(20)
    setState("session", session("other"))

    await refresh

    expect(state.sessionMessages).toEqual([])
  })
})
