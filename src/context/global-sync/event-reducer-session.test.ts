import { afterEach, describe, expect, test } from "bun:test"
import type { OpenCodeEvent, SessionInfo as Session } from "@opencode-ai/client/promise"
import { applySessionEvent } from "@/context/global-sync/event-reducer-session"
import { setSessionClient, setState, state } from "@/context/server-session-store"
import type { OpencodeClient } from "@/context/server-sdk-client"

const session = (id = "session"): Session => ({
  id,
  projectID: "project",
  location: { directory: "/repo" },
  title: id,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
})

const event = (input: object) => input as OpenCodeEvent
const base = {
  created: 10,
  location: { directory: "/repo" },
  durable: { aggregateID: "session", seq: 1, version: 1 as const },
}

const client = {} as OpencodeClient

afterEach(() => {
  setSessionClient(undefined)
  setState("session", undefined)
  setState("sessionMessages", [])
  setState("messages", [])
  setState("error", "")
})

describe("applySessionEvent", () => {
  test("streams text deltas into the projected timeline without refreshing", () => {
    setSessionClient(client)
    setState("session", session())
    setState("sessionMessages", [{ id: "msg_user", type: "user", text: "hi", time: { created: 1 } }])
    let refreshes = 0
    const refresh = () => {
      refreshes += 1
    }

    applySessionEvent(
      event({
        ...base,
        id: "evt_step",
        type: "session.step.started",
        data: {
          sessionID: "session",
          assistantMessageID: "msg_assistant",
          agent: "7777",
          model: { id: "model", providerID: "provider" },
        },
      }),
      { refresh },
    )
    applySessionEvent(
      event({
        ...base,
        id: "evt_text_start",
        type: "session.text.started",
        data: { sessionID: "session", assistantMessageID: "msg_assistant", ordinal: 0 },
      }),
      { refresh },
    )
    applySessionEvent(
      event({
        ...base,
        id: "evt_delta_1",
        type: "session.text.delta",
        data: { sessionID: "session", assistantMessageID: "msg_assistant", ordinal: 0, delta: "hel" },
      }),
      { refresh },
    )
    applySessionEvent(
      event({
        ...base,
        id: "evt_delta_2",
        type: "session.text.delta",
        data: { sessionID: "session", assistantMessageID: "msg_assistant", ordinal: 0, delta: "lo" },
      }),
      { refresh },
    )

    expect(refreshes).toBe(0)
    const assistant = state.messages.find((item) => item.info.id === "msg_assistant")
    expect(assistant?.parts).toEqual([
      {
        id: "msg_assistant:text:0",
        sessionID: "session",
        messageID: "msg_assistant",
        type: "text",
        text: "hello",
      },
    ])
  })

  test("ignores events for other sessions", () => {
    setSessionClient(client)
    setState("session", session())
    let refreshes = 0

    const handled = applySessionEvent(
      event({
        ...base,
        id: "evt_other",
        type: "session.text.delta",
        data: { sessionID: "other", assistantMessageID: "msg_assistant", ordinal: 0, delta: "nope" },
      }),
      { refresh: () => refreshes++ },
    )

    expect(handled).toBe(false)
    expect(refreshes).toBe(0)
    expect(state.messages).toEqual([])
  })

  test("refreshes for session events the reducer does not project", () => {
    setSessionClient(client)
    setState("session", session())
    let refreshes = 0

    applySessionEvent(
      event({ ...base, id: "evt_renamed", type: "session.renamed", data: { sessionID: "session", title: "new" } }),
      { refresh: () => refreshes++ },
    )

    expect(refreshes).toBe(1)
    expect(state.session?.title).toBe("new")
  })
})
