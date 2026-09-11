import { afterEach, describe, expect, test } from "bun:test"
import type { OpenCodeEvent, SessionInfo } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { disposeSessionSync, restartSessionEventStream, sessionEvents } from "./sync-session-compact"
import { setState, state } from "./session-store-compact"

const originalFetch = globalThis.fetch
const encode = new TextEncoder()

afterEach(() => {
  disposeSessionSync()
  globalThis.fetch = originalFetch
  setState("server", undefined)
  setState("session", undefined)
  setState("form", reconcile({}))
})

async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error("Session stream did not reach the expected state")
}

function fixture() {
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          streams.push(controller)
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    )) as unknown as typeof fetch
  setState("server", { url: "http://fixture.test", localAgent: "7777", welcomeText: "", suggestedQuestions: [] })
  setState("session", { id: "session", location: { directory: "/repo" } } as SessionInfo)
  return streams
}

describe("compact session event stream", () => {
  test("admits form handoffs only after SSE activity and disconnects on EOF", async () => {
    const streams = fixture()
    restartSessionEventStream()
    expect(state.eventsConnected).toBe(false)
    await until(() => streams.length === 1)
    streams[0].enqueue(encode.encode(": connected\n\n"))
    await until(() => state.eventsConnected)
    expect(state.eventsConnected).toBe(true)
    streams[0].close()
    await until(() => !state.eventsConnected)
    expect(state.eventsConnected).toBe(false)
  })

  test("forwards events to listeners and keeps a replacement stream connected", async () => {
    const streams = fixture()
    const received: string[] = []
    const stop = sessionEvents.listen((event) => received.push(event.type))
    try {
      restartSessionEventStream()
      await until(() => streams.length === 1)
      restartSessionEventStream()
      await until(() => streams.length === 2)
      streams[1].enqueue(encode.encode(": connected\n\n"))
      await until(() => state.eventsConnected)
      streams[0].close()
      const event = {
        id: "evt",
        created: 1,
        type: "form.cancelled",
        data: { id: "form", sessionID: "session" },
      } satisfies OpenCodeEvent
      streams[1].enqueue(encode.encode(`data: ${JSON.stringify(event)}\n\n`))
      await until(() => received.length === 1)
      expect(received).toEqual(["form.cancelled"])
      expect(state.eventsConnected).toBe(true)
      stop()
      streams[1].enqueue(encode.encode(`data: ${JSON.stringify(event)}\n\n`))
      streams[1].close()
      await until(() => !state.eventsConnected)
      expect(received).toEqual(["form.cancelled"])
    } finally {
      stop()
    }
  })
})
