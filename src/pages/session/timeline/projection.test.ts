import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk"
import type { HistoryItem } from "@/context/global-sync/session-cache"
import { projectTimelineMessages, projectTimelineRows } from "./projection"

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

  test("adds gaps between turns and dividers for compaction and interruption", () => {
    const first = item("msg_1", "user")
    const second = item("msg_2", "user")
    second.parts = [{ type: "compaction" } as Part]
    const aborted = item("msg_3", "assistant", {
      parentID: second.info.id,
      error: { name: "MessageAbortedError" },
    } as Partial<Message>)

    expect(projectTimelineRows([first, second, aborted], [first, second]).map((row) => row._tag)).toEqual([
      "UserMessage",
      "TurnGap",
      "UserMessage",
      "TurnDivider",
      "AssistantMessage",
      "TurnDivider",
    ])
  })

  test("adds retry to the active turn with or without an assistant response", () => {
    const user = item("msg_1", "user")
    const assistant = item("msg_2", "assistant", { parentID: user.info.id } as Partial<Message>)

    expect(projectTimelineRows([user], [user], { type: "retry", attempt: 1, message: "retrying", next: 1 }).at(-1)?._tag).toBe(
      "Retry",
    )
    expect(
      projectTimelineRows([user, assistant], [user], { type: "retry", attempt: 1, message: "retrying", next: 1 }).at(
        -1,
      )?._tag,
    ).toBe("Retry")
  })
})
