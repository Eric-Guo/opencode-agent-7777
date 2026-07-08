import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk"
import type { HistoryItem } from "@/context/global-sync/session-cache"
import { projectTimelineMessages } from "./projection"

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

describe("timeline projection", () => {
  test("projects assistant messages under visible user parents", () => {
    const parent = item("msg_1", "user")
    const child = item("msg_2", "assistant", { parentID: parent.info.id } as Partial<Message>)
    const orphan = item("msg_3", "assistant", { parentID: "missing" } as Partial<Message>)

    expect(projectTimelineMessages([child, orphan, parent], [parent]).map((message) => message.info.id)).toEqual([
      "msg_1",
      "msg_2",
    ])
  })

  test("projects assistant parent chains under visible user parents", () => {
    const user = item("msg_1", "user")
    const parent = item("msg_2", "assistant", { parentID: user.info.id } as Partial<Message>)
    const child = item("msg_3", "assistant", { parentID: parent.info.id } as Partial<Message>)

    expect(projectTimelineMessages([child, parent, user], [user]).map((message) => message.info.id)).toEqual([
      "msg_1",
      "msg_2",
      "msg_3",
    ])
  })
})
