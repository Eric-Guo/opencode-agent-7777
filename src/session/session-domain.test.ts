import { describe, expect, test } from "bun:test"
import type { SessionMessageAssistant, SessionMessageInfo, SessionMessageUser } from "@opencode/client/promise"
import { removedSessionIDs, selectSessionUserMessages } from "./session-domain"

const user = (id: string): SessionMessageUser => ({ id, type: "user", text: id, time: { created: 0 } })
const assistant = {
  id: "msg_2",
  type: "assistant",
  time: { created: 0 },
  agent: "build",
  model: { id: "model", providerID: "provider" },
  content: [],
} as SessionMessageAssistant

describe("session domain", () => {
  test("selects user messages for Undo and Redo", () => {
    const messages: SessionMessageInfo[] = [user("msg_a"), assistant, user("msg_b"), user("msg_c")]
    const users = selectSessionUserMessages(messages)

    expect(users.map((message) => message.id)).toEqual(["msg_a", "msg_b", "msg_c"])
  })

  test("collects a removed session and all descendants", () => {
    const sessions = [
      { id: "root" },
      { id: "child", parentID: "root" },
      { id: "grandchild", parentID: "child" },
      { id: "other" },
    ]

    expect([...removedSessionIDs(sessions, "root")]).toEqual(["root", "child", "grandchild"])
  })
})
