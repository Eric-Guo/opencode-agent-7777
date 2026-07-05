import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk"
import type { HistoryItem } from "@/context/server-session"
import { isTimelineReady, projectTimelineMessages, selectUserMessages, selectVisibleUserMessages } from "./model"

const item = (id: string, role: Message["role"], input: Partial<Message> = {}): HistoryItem =>
  ({
    info: {
      id,
      role,
      time: { created: 1 },
      ...input,
    } as Message,
    parts: [] as Part[],
  }) satisfies HistoryItem

describe("timeline model", () => {
  test("selects users and applies the revert boundary", () => {
    const messages = [
      item("msg_1", "user"),
      item("msg_2", "assistant", { parentID: "msg_1" } as Partial<Message>),
      item("msg_3", "user"),
      item("msg_5", "user"),
    ]
    const users = selectUserMessages(messages)

    expect(users.map((message) => message.info.id)).toEqual(["msg_1", "msg_3", "msg_5"])
    expect(selectVisibleUserMessages(users, "msg_5").map((message) => message.info.id)).toEqual(["msg_1", "msg_3"])
    expect(selectVisibleUserMessages(users)).toBe(users)
  })

  test("projects assistant messages under visible user parents", () => {
    const parent = item("msg_1", "user")
    const child = item("msg_2", "assistant", { parentID: parent.info.id } as Partial<Message>)
    const orphan = item("msg_3", "assistant", { parentID: "missing" } as Partial<Message>)

    expect(projectTimelineMessages([child, orphan, parent], [parent]).map((message) => message.info.id)).toEqual([
      "msg_1",
      "msg_2",
    ])
  })

  test("waits for an assistant-only load to hydrate its user root", () => {
    expect(isTimelineReady([item("msg_2", "assistant")], true)).toBe(false)
    expect(isTimelineReady([item("msg_1", "user"), item("msg_2", "assistant")], true)).toBe(true)
    expect(isTimelineReady([], false)).toBe(true)
  })
})
