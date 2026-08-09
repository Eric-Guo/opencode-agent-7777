import { describe, expect, mock, test } from "bun:test"
import type { HistoryItem } from "@/context/global-sync/types"
import type { Message, Part } from "@/types"

mock.module("@opencode-ai/session-ui/message-part", () => ({
  renderable: () => true,
  groupParts: (refs: Array<{ messageID: string; part: { id: string } }>) =>
    refs.map((ref) => ({
      type: "part" as const,
      key: ref.part.id,
      ref: { messageID: ref.messageID, partID: ref.part.id },
    })),
}))

const { isTimelineReady, selectUserMessages, selectVisibleUserMessages } = await import("./model")

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
