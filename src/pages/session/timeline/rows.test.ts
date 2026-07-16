import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/client"
import type { HistoryItem } from "@/context/global-sync/types"
import { createTimelineMessageRow } from "./rows"

const item = (role: Message["role"], parts: Part[] = []): HistoryItem => ({
  info: { id: role, role, time: { created: 1 } } as Message,
  parts,
})

describe("timeline rows", () => {
  test("routes user and assistant messages through different row tags", () => {
    const user = createTimelineMessageRow(item("user"))
    const assistant = createTimelineMessageRow(
      item("assistant", [
        {
          id: "part",
          sessionID: "session",
          messageID: "assistant",
          type: "text",
          text: "answer",
        },
      ]),
    )

    expect(user._tag).toBe("UserMessage")
    expect(assistant._tag).toBe("AssistantMessage")
    if (assistant._tag === "AssistantMessage") expect(assistant.content.text).toBe("answer")
  })
})
