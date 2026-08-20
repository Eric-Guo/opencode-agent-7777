import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo, SessionStatus } from "@opencode-ai/client/promise"
import type { HistoryItem } from "@/context/global-sync/types"
import type { AssistantMessage, UserMessage } from "@/types"
import { createTimelineModel, isTimelineReady } from "./model"

const user = (id: string) => ({ id, role: "user" }) as UserMessage
const assistant = (id: string) => ({ id, role: "assistant" }) as AssistantMessage

const legacyUser = (id: string, created: number, diffs?: { file: string }[]) =>
  ({
    info: {
      id,
      role: "user",
      time: { created },
      summary: diffs ? { diffs } : undefined,
    },
    parts: [],
  }) as unknown as HistoryItem

const sessionUser = (id: string, created: number) =>
  ({ id, type: "user", text: "hi", time: { created } }) as SessionMessageInfo
const sessionAssistant = (id: string, created: number) =>
  ({
    id,
    type: "assistant",
    time: { created, completed: created + 1 },
    content: [{ type: "text", id: `${id}:text`, text: "ok" }],
  }) as unknown as SessionMessageInfo

const idle = { type: "idle" } as SessionStatus

function model(input: {
  items: HistoryItem[]
  sessionMessages: SessionMessageInfo[]
  status?: SessionStatus
  revertMessageID?: string
}) {
  return createTimelineModel({
    messages: () => input.items,
    sessionMessages: () => input.sessionMessages,
    loading: () => false,
    showReasoningSummaries: () => true,
    revertMessageID: () => input.revertMessageID,
    status: () => input.status ?? idle,
  })
}

describe("timeline model", () => {
  test("waits for an assistant-only load to hydrate its user root", () => {
    expect(isTimelineReady([assistant("msg_2")], true)).toBe(false)
    expect(isTimelineReady([user("msg_1"), assistant("msg_2")], true)).toBe(true)
    expect(isTimelineReady([], false)).toBe(true)
  })

  test("limits the timeline to the latest nine dialogs", () => {
    const items: HistoryItem[] = []
    const sessionMessages: SessionMessageInfo[] = []
    for (let index = 1; index <= 12; index++) {
      items.push(legacyUser(`msg_${index}`, index))
      sessionMessages.push(sessionUser(`msg_${index}`, index), sessionAssistant(`msg_${index}:a`, index))
    }
    const timeline = model({ items, sessionMessages })
    const users = timeline.visibleRows().filter((row) => row._tag === "UserMessage")
    expect(users.map((row) => row.userMessageID)).toEqual([
      "msg_4",
      "msg_5",
      "msg_6",
      "msg_7",
      "msg_8",
      "msg_9",
      "msg_10",
      "msg_11",
      "msg_12",
    ])
    expect(timeline.userDialogCount()).toBe(9)
  })

  test("hides turns beyond the revert boundary", () => {
    const items = [legacyUser("msg_1", 1), legacyUser("msg_2", 2), legacyUser("msg_3", 3)]
    const sessionMessages = [
      sessionUser("msg_1", 1),
      sessionAssistant("msg_1:a", 1),
      sessionUser("msg_2", 2),
      sessionAssistant("msg_2:a", 2),
      sessionUser("msg_3", 3),
      sessionAssistant("msg_3:a", 3),
    ]
    const timeline = model({ items, sessionMessages, revertMessageID: "msg_3" })
    const users = timeline.visibleRows().filter((row) => row._tag === "UserMessage")
    expect(users.map((row) => row.userMessageID)).toEqual(["msg_1", "msg_2"])
  })

  test("injects a diff summary after the turn's last row while idle", () => {
    const items = [legacyUser("msg_1", 1, [{ file: "a.ts" }])]
    const sessionMessages = [sessionUser("msg_1", 1), sessionAssistant("msg_1:a", 1)]
    const timeline = model({ items, sessionMessages })
    const rows = timeline.visibleRows()
    expect(rows.at(-1)?._tag).toBe("DiffSummary")
  })

  test("omits the diff summary for the active turn while busy", () => {
    const items = [legacyUser("msg_1", 1, [{ file: "a.ts" }])]
    const sessionMessages = [sessionUser("msg_1", 1), sessionAssistant("msg_1:a", 1)]
    const timeline = model({ items, sessionMessages, status: { type: "busy" } as SessionStatus })
    expect(timeline.visibleRows().some((row) => row._tag === "DiffSummary")).toBe(false)
  })
})
