import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { SessionInfo, SessionPromptInput } from "@opencode/client/promise"
import { prompt } from "./persistence-singleton"
import { abortPrompt, submitPrompt } from "./submit"
import type { OpencodeClient } from "@/runtime/server/client-compact"
import { disposeRefreshQueue } from "@/runtime/server/global-sync/queue-message-refresh"
import { resetPendingEchoes, updatePendingInbox } from "@/runtime/server/global-sync/session-cache-messages"
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
      switchModel: input.configure ?? (() => Promise.resolve()),
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
  test("interrupts with the current client's resume option without changing the draft", async () => {
    const requests: unknown[] = []
    setSessionClient({
      session: {
        interrupt: async (value: unknown) => {
          requests.push(value)
        },
      },
    } as unknown as OpencodeClient)

    abortPrompt()
    await Promise.resolve()
    await Promise.resolve()
    expect(requests).toEqual([{ sessionID: "session", resume: true }])
    expect(prompt.capture()).toEqual(draft())
  })

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
        delivery: "steer",
        metadata: { agent: "7777" },
      },
    ])
    expect(prompt.capture()).toEqual({ prompt: "", attachments: [] })
    expect(state.submitting).toBe(false)
  })

  test("queues attachments without reconfiguring active work or echoing a new dialog", async () => {
    const requests: SessionPromptInput[] = []
    setState({ sessionStatus: { type: "busy" }, selectedModel: { providerID: "provider", modelID: "model" } })
    setSessionClient(
      client({
        configure: () => {
          throw new Error("Queued prompts must not switch the active agent")
        },
        send: async (value) => {
          const input = value as SessionPromptInput
          requests.push(input)
          return {
            id: input.id,
            sessionID: input.sessionID,
            type: "user",
            delivery: input.delivery,
            payload: { text: input.text },
            time: { created: 1 },
          }
        },
      }),
    )

    await submitPrompt({ delivery: "queue" })

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      delivery: "queue",
      text: "explain this",
      files: [{ uri: "data:image/png;base64,aGVsbG8=", name: "image.png" }],
      metadata: { agent: "7777", model: { providerID: "provider", modelID: "model" } },
    })
    expect(state.sessionPending).toHaveLength(1)
    expect(state.sessionMessages).toEqual([])
    expect(state.sessionStatus).toEqual({ type: "busy" })
    expect(prompt.capture()).toEqual({ prompt: "", attachments: [] })
  })

  test.each(["steer", "queue"] as const)(
    "a failed %s follow-up restores the draft and keeps the active turn busy",
    async (delivery) => {
      setState("sessionStatus", { type: "busy" })
      setSessionClient(
        client({
          send: async () => {
            throw new Error("follow-up failed")
          },
        }),
      )

      await submitPrompt({ delivery })

      expect(prompt.capture()).toEqual(draft())
      expect(state.sessionStatus).toEqual({ type: "busy" })
      expect(state.submitting).toBe(false)
      expect(state.error).toBe("follow-up failed")
      expect(state.sessionMessages).toEqual([])
    },
  )

  test("does not resurrect an admission when its inbox event arrived before HTTP completed", async () => {
    const admission = Promise.withResolvers<unknown>()
    setSessionClient(client({ send: () => admission.promise }))
    const pending = submitPrompt({ delivery: "queue" })
    updatePendingInbox(() => [])
    admission.resolve({
      id: "already-delivered",
      sessionID: "session",
      type: "user",
      delivery: "queue",
      payload: { text: "done" },
      time: { created: 1 },
    })
    await pending
    expect(state.sessionPending).toEqual([])
  })

  test("does not admit a second draft while the first request is pending", async () => {
    const sending = Promise.withResolvers<unknown>()
    setSessionClient(client({ send: () => sending.promise }))
    const pending = submitPrompt({ delivery: "queue" })
    prompt.set("next draft")
    expect(submitPrompt({ delivery: "steer" })).toBeUndefined()
    expect(prompt.current()).toBe("next draft")
    sending.resolve(undefined)
    await pending
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
