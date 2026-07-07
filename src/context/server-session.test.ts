import { afterEach, describe, expect, test } from "bun:test"
import type { Message, Part, Session } from "@opencode-ai/sdk"
import { refreshMessages, setSessionClient, setState, state, type HistoryItem } from "@/context/server-session"
import type { OpencodeClient } from "@/context/sdk"

type UserMessage = Extract<Message, { role: "user" }>
type AssistantMessage = Extract<Message, { role: "assistant" }>
type TextPart = Extract<Part, { type: "text" }>
type MessageResponse = { data: HistoryItem[] }
type SingleMessageResponse = { data: HistoryItem | undefined }

const session = (id = "session"): Session => ({
  id,
  projectID: "project",
  directory: "/repo",
  title: id,
  version: "1",
  time: { created: 1, updated: 1 },
})

const userMessage = (id: string, input: Partial<UserMessage> = {}): UserMessage => ({
  id,
  sessionID: "session",
  role: "user",
  time: { created: 1 },
  agent: "build",
  model: { providerID: "provider", modelID: "model" },
  ...input,
})

const assistantMessage = (id: string, parentID: string, input: Partial<AssistantMessage> = {}): AssistantMessage => ({
  id,
  sessionID: "session",
  role: "assistant",
  time: { created: 2, completed: 2 },
  parentID,
  modelID: "model",
  providerID: "provider",
  mode: "build",
  path: { cwd: "/repo", root: "/repo" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  ...input,
})

const textPart = (messageID: string, input: Partial<TextPart> = {}): TextPart => ({
  id: `part-${messageID}`,
  sessionID: "session",
  messageID,
  type: "text",
  text: "text",
  ...input,
})

const historyItem = (info: Message, parts: Part[] = []): HistoryItem => ({ info, parts })

function messageClient(pages: MessageResponse[], roots: SingleMessageResponse[]) {
  let pageIndex = 0
  let rootIndex = 0
  const requests: unknown[] = []
  const rootRequests: unknown[] = []
  const client = {
    session: {
      messages: (input: unknown) => {
        requests.push(input)
        return Promise.resolve(pages[pageIndex++])
      },
      message: (input: unknown) => {
        rootRequests.push(input)
        return Promise.resolve(roots[rootIndex++])
      },
    },
  } as unknown as OpencodeClient
  return Object.assign(client, { requests, rootRequests })
}

afterEach(() => {
  setSessionClient(undefined)
  setState("session", undefined)
  setState("messages", [])
  setState("messagesLoading", false)
  setState("error", "")
})

describe("server session message hydration", () => {
  test("backfills missing assistant user parents from the single-message endpoint", async () => {
    const parent = userMessage("msg_1")
    const assistant = assistantMessage("msg_2", parent.id)
    const parentPart = textPart(parent.id)
    const client = messageClient([{ data: [historyItem(assistant)] }], [{ data: historyItem(parent, [parentPart]) }])
    setSessionClient(client)
    setState("session", session())

    await refreshMessages(2)

    expect(client.requests).toEqual([{ path: { id: "session" }, query: { limit: 2 } }])
    expect(client.rootRequests).toEqual([{ path: { id: "session", messageID: parent.id } }])
    expect(state.messages.map((item) => item.info.id)).toEqual([parent.id, assistant.id])
    expect(state.messages[0]?.parts).toEqual([parentPart])
  })

  test("refreshes a cached user parent when a refresh page omits it", async () => {
    const stale = userMessage("msg_1", { summary: { title: "stale", diffs: [] } })
    const fresh = userMessage("msg_1", { summary: { title: "fresh", diffs: [] } })
    const freshPart = textPart(fresh.id, { text: "fresh" })
    const assistant = assistantMessage("msg_2", stale.id)
    const client = messageClient([{ data: [historyItem(assistant)] }], [{ data: historyItem(fresh, [freshPart]) }])
    setSessionClient(client)
    setState("session", session())
    setState("messages", [historyItem(stale)])

    await refreshMessages(2)

    expect(client.rootRequests).toEqual([{ path: { id: "session", messageID: stale.id } }])
    expect(state.messages.map((item) => item.info.id)).toEqual([fresh.id, assistant.id])
    expect(state.messages[0]?.info).toEqual(fresh)
    expect(state.messages[0]?.parts).toEqual([freshPart])
  })

  test("falls back to a cached user parent when parent hydration fails", async () => {
    const parent = userMessage("msg_1")
    const assistant = assistantMessage("msg_2", parent.id)
    const client = messageClient([{ data: [historyItem(assistant)] }], [{ data: undefined }])
    setSessionClient(client)
    setState("session", session())
    setState("messages", [historyItem(parent)])

    await refreshMessages(2)

    expect(client.rootRequests).toEqual([{ path: { id: "session", messageID: parent.id } }])
    expect(state.messages.map((item) => item.info.id)).toEqual([parent.id, assistant.id])
  })

  test("backfills assistant parent chains through the visible user root", async () => {
    const parent = userMessage("msg_1")
    const assistant = assistantMessage("msg_2", parent.id)
    const child = assistantMessage("msg_3", assistant.id, { time: { created: 3, completed: 3 } })
    const client = messageClient(
      [{ data: [historyItem(child)] }],
      [{ data: historyItem(assistant) }, { data: historyItem(parent) }],
    )
    setSessionClient(client)
    setState("session", session())

    await refreshMessages(2)

    expect(client.rootRequests).toEqual([
      { path: { id: "session", messageID: assistant.id } },
      { path: { id: "session", messageID: parent.id } },
    ])
    expect(state.messages.map((item) => item.info.id)).toEqual([parent.id, assistant.id, child.id])
  })
})
