import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk"
import type { HistoryItem } from "@/context/server-session"
import { isTimelineReady } from "./model"

const item = (id: string, role: Message["role"]): HistoryItem =>
  ({
    info: {
      id,
      role,
      time: { created: 1 },
    } as Message,
    parts: [] as Part[],
  }) satisfies HistoryItem

describe("timeline model", () => {
  test("waits for an assistant-only load to hydrate its user root", () => {
    expect(isTimelineReady([item("msg_2", "assistant")], true)).toBe(false)
    expect(isTimelineReady([item("msg_1", "user"), item("msg_2", "assistant")], true)).toBe(true)
    expect(isTimelineReady([], false)).toBe(true)
  })
})
