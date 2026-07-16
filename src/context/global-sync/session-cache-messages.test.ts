import { afterEach, describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode-ai/client"
import { refreshMessages } from "@/context/global-sync/session-cache-messages"
import { setSessionClient, setState, state } from "@/context/server-session-store"
import type { OpencodeClient } from "@/context/server-sdk-client"
import type { Session } from "@/context/session-directory"

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

afterEach(() => {
  setSessionClient(undefined)
  setState("session", undefined)
  setState("messages", [])
  setState("messagesLoading", false)
})

describe("single-session message cache", () => {
  test("projects current session messages into the timeline model", async () => {
    const client = messageClient(messages)
    setSessionClient(client)
    setState("session", session())

    await refreshMessages(20)

    expect(client.requests).toEqual([{ sessionID: "session", limit: 20, order: "desc" }])
    expect(state.messages.map((item) => item.info.id)).toEqual(["msg_user", "msg_assistant"])
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

    expect(state.messages).toEqual([])
  })
})
