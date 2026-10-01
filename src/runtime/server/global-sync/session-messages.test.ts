import { describe, expect, test } from "bun:test"
import type { SessionInboxInfo } from "@opencode/client/promise"
import { inboxItemMessage } from "./session-messages"

const inboxUser = (id: string, created: number, text: string): SessionInboxInfo => ({
  id,
  sessionID: "ses_test",
  time: { created },
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
      time: { created: 2000 },
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
      time: { created: 3000 },
      type: "compaction",
      payload: {},
      delivery: "steer",
    }
    expect(inboxItemMessage(item)).toBeUndefined()
  })
})
