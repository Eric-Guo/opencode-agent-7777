import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/client"
import type { HistoryItem } from "@/context/global-sync/session-cache"
import { isTimelineReady, selectUserMessages, selectVisibleUserMessages } from "./model"

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

  test("waits for an assistant-only load to hydrate its user root", () => {
    expect(isTimelineReady([item("msg_2", "assistant")], true)).toBe(false)
    expect(isTimelineReady([item("msg_1", "user"), item("msg_2", "assistant")], true)).toBe(true)
    expect(isTimelineReady([], false)).toBe(true)
  })
})
