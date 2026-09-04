import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode-ai/client/promise"
import { prompt } from "./persistence-singleton"
import { submitPrompt } from "./submit"
import type { OpencodeClient } from "@/runtime/server/client-compact"
import { disposeRefreshQueue } from "@/runtime/server/global-sync/queue-message-refresh"
import { resetPendingEchoes } from "@/runtime/server/global-sync/session-cache-messages"
import { idleStatus, setSessionClient, setState, state } from "@/runtime/server/session-store-compact"

function session(id = "session"): SessionInfo {
  return {
    id,
    agent: "7777",
    projectID: "project",
    location: { directory: "/repo" },
    title: id,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
}

function draft() {
  return {
    prompt: "  explain this\n",
    attachments: [{ id: "image", filename: "image.png", mime: "image/png", url: "data:image/png;base64,aGVsbG8=" }],
  }
}

function client(input: { configure?: () => Promise<unknown>; send: (value: unknown) => Promise<unknown> }) {
  return {
    session: {
      switchAgent: input.configure ?? (() => Promise.resolve()),
      switchModel: () => Promise.resolve(),
      revert: { clear: () => Promise.resolve() },
      prompt: input.send,
    },
  } as unknown as OpencodeClient
}

beforeEach(() => {
  setState({
    server: undefined,
    session: session(),
    sessionMessages: [],
    sessionStatus: { type: "idle" },
    selectedModel: undefined,
    submitting: false,
    error: "",
  })
  prompt.restore(draft())
})

afterEach(() => {
  disposeRefreshQueue()
  resetPendingEchoes()
  setSessionClient(undefined)
  setState({ session: undefined, sessionMessages: [], sessionStatus: { type: "idle" }, submitting: false, error: "" })
  prompt.reset()
})

describe("composer submission", () => {
  test("waits for configuration, echoes the request, and leaves a successful draft clear", async () => {
    const configured = Promise.withResolvers<void>()
    const requests: unknown[] = []
    setSessionClient(
      client({
        configure: () => configured.promise,
        send: async (value) => {
          requests.push(value)
        },
      }),
    )

    const pending = submitPrompt()
    const echo = state.sessionMessages[0]
    expect(requests).toEqual([])
    expect(state.submitting).toBe(true)
    expect(state.sessionStatus).toEqual({ type: "busy" })
    expect(idleStatus).toEqual({ type: "idle" })
    expect(prompt.capture()).toEqual({ prompt: "", attachments: [] })
    expect(echo).toMatchObject({ type: "user", text: "explain this" })

    configured.resolve()
    await pending

    expect(requests).toEqual([
      {
        sessionID: "session",
        id: echo.id,
        text: "explain this",
        files: [{ uri: "data:image/png;base64,aGVsbG8=", name: "image.png" }],
      },
    ])
    expect(prompt.capture()).toEqual({ prompt: "", attachments: [] })
    expect(state.submitting).toBe(false)
  })

  test.each(["configuration", "prompt"])("restores the draft after a failed %s request", async (stage) => {
    const fail = () => Promise.reject(new Error("send failed"))
    setSessionClient(client({ configure: stage === "configuration" ? fail : undefined, send: fail }))
    setState("session", { ...session(), revert: { messageID: "previous" } })

    await submitPrompt()

    expect(prompt.capture()).toEqual(draft())
    expect(state.sessionMessages).toEqual([])
    expect(state.session?.revert).toEqual({ messageID: "previous" })
    expect(state.sessionStatus).toEqual({ type: "idle" })
    expect(state.submitting).toBe(false)
    expect(state.error).toContain("send failed")
    expect(idleStatus).toEqual({ type: "idle" })
  })

  test("keeps a new draft when sending the previous prompt fails", async () => {
    const configured = Promise.withResolvers<void>()
    setSessionClient(client({ configure: () => configured.promise, send: async () => {} }))

    const pending = submitPrompt()
    prompt.set("follow-up")
    configured.reject(new Error("send failed"))
    await pending

    expect(prompt.capture()).toEqual({ prompt: "follow-up", attachments: [] })
    expect(state.sessionMessages).toEqual([])
  })

  test.each(["success", "failure"])("ignores an old session's %s after switching", async (outcome) => {
    const configured = Promise.withResolvers<void>()
    setSessionClient(client({ configure: () => configured.promise, send: async () => {} }))

    const pending = submitPrompt()
    setState("session", session("next"))
    resetPendingEchoes()
    setState({ sessionMessages: [], submitting: true, sessionStatus: { type: "busy" }, error: "new session error" })
    prompt.restore({ prompt: "new session draft", attachments: [] })
    if (outcome === "success") configured.resolve()
    if (outcome === "failure") configured.reject(new Error("old session error"))
    await pending

    expect(prompt.capture()).toEqual({ prompt: "new session draft", attachments: [] })
    expect(state.sessionMessages).toEqual([])
    expect(state.sessionStatus).toEqual({ type: "busy" })
    expect(state.submitting).toBe(true)
    expect(state.error).toBe("new session error")
  })
})
