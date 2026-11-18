import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo, SessionMessageUser, SessionStatus } from "@opencode/client/promise"
import { createCompactTimelineModel } from "./model-compact"

const sessionUser = (id: string, created: number): SessionMessageUser => ({
  id,
  type: "user",
  text: "hi",
  time: { created },
})
const sessionAssistant = (id: string, created: number) =>
  ({
    id,
    type: "assistant",
    time: { created, completed: created + 1 },
    agent: "7777",
    model: { id: "model", providerID: "provider" },
    content: [{ type: "text", text: "ok" }],
  }) as SessionMessageInfo

const idle = { type: "idle" } as SessionStatus

function model(input: {
  messages: SessionMessageInfo[]
  status?: SessionStatus
  revertMessageID?: string
  loading?: boolean
}) {
  return createCompactTimelineModel({
    sessionID: () => "session",
    messages: () => input.messages,
    loading: () => input.loading ?? false,
    revertMessageID: () => input.revertMessageID,
    status: () => input.status ?? idle,
  })
}

describe("compact timeline model", () => {
  test("waits for an assistant-only load to hydrate its dialog root", () => {
    const assistant = sessionAssistant("msg_2", 2)
    expect(model({ messages: [assistant], loading: true }).ready()).toBe(false)
    expect(model({ messages: [sessionUser("msg_1", 1), assistant], loading: true }).ready()).toBe(true)
  })

  test("shows loading while all loaded dialogs are hidden by a revert", () => {
    const input = { messages: [sessionUser("msg_2", 2)], revertMessageID: "msg_1", loading: true }
    expect(model(input).ready()).toBe(false)
    expect(model({ ...input, loading: false }).ready()).toBe(true)
  })

  test("limits the timeline to the latest nine dialogs", () => {
    const messages: SessionMessageInfo[] = []
    for (let index = 1; index <= 12; index++) {
      messages.push(sessionUser(`msg_${index.toString().padStart(2, "0")}`, index))
      messages.push(sessionAssistant(`msg_${index.toString().padStart(2, "0")}:a`, index))
    }
    const timeline = model({ messages })
    const users = timeline.document().messages.filter((message) => message.type === "user")
    expect(users.map((message) => message.id)).toEqual([
      "msg_04",
      "msg_05",
      "msg_06",
      "msg_07",
      "msg_08",
      "msg_09",
      "msg_10",
      "msg_11",
      "msg_12",
    ])
    expect(timeline.userDialogCount()).toBe(9)
  })

  test("counts shell turns in the bounded dialog window", () => {
    const shell = {
      id: "msg_shell",
      type: "shell",
      shellID: "shell",
      command: "pwd",
      status: "exited",
      output: { output: "repo", cursor: 4, size: 4, truncated: false },
      time: { created: 2, completed: 3 },
    } satisfies SessionMessageInfo
    const timeline = model({ messages: [sessionUser("msg_1", 1), shell] })

    expect(timeline.userDialogCount()).toBe(2)
  })

  test("hides messages at and beyond the revert boundary", () => {
    const messages = [
      { id: "msg_0", type: "system", text: "Leading notice", time: { created: 0 } } satisfies SessionMessageInfo,
      sessionUser("msg_1", 1),
      sessionAssistant("msg_1:a", 1),
      sessionUser("msg_2", 2),
      sessionAssistant("msg_2:a", 2),
      sessionUser("msg_3", 3),
      sessionAssistant("msg_3:a", 3),
    ]
    const timeline = model({ messages, revertMessageID: "msg_3" })
    expect(timeline.document().messages.map((message) => message.id)).toEqual([
      "msg_0",
      "msg_1",
      "msg_1:a",
      "msg_2",
      "msg_2:a",
    ])
  })
})
