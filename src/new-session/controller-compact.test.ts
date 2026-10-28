import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { prompt } from "@/composer/persistence-singleton"
import { createPromptModelSelection } from "@/composer/selection"
import { submitPrompt } from "@/composer/submit"
import { readSessionRecord, writeSessionRecord } from "@/runtime/persistence/storage-compact"
import { activateDraft } from "@/runtime/server/global-sync/bootstrap-session"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import {
  currentDirectory,
  currentDraft,
  currentRuntime,
  setSessionClient,
  setState,
  state,
} from "@/runtime/server/session-store-compact"
import { disposeSessionSync } from "@/runtime/server/sync-session-compact"
import { startNewSession } from "./controller-compact"

browserSuite(import.meta.path, () => {
  const originalFetch = globalThis.fetch
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const server = { url: "http://draft.test", localAgent: "7777", welcomeText: "", suggestedQuestions: [] }
  const directory = "/repo"
  const session = (id: string): SessionInfo => ({
    id,
    agent: "7777",
    projectID: "project",
    location: { directory },
    title: id,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  })
  const model = {
    id: "reasoning",
    providerID: "draft-test",
    name: "Reasoning",
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    variants: [{ id: "high" }, { id: "low" }],
    cost: [],
    limit: { context: 100000, output: 10000 },
    time: { released: 1 },
    status: "active",
    enabled: true,
  }

  function fixture(create: () => Promise<Response> = async () => Response.json({ data: session("created") })) {
    const requests: { method: string; path: string; body: unknown }[] = []
    globalThis.fetch = (async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      const body = request.method === "POST" ? await request.json() : undefined
      requests.push({ method: request.method, path, body })
      if (path === "/api/session" && request.method === "POST") return create()
      if (path === "/api/session") return Response.json({ data: [], cursor: {} })
      if (path === "/api/model/default") return Response.json({ location: { directory }, data: model })
      if (path === "/api/model") return Response.json({ location: { directory }, data: [model] })
      if (path === "/api/provider")
        return Response.json({
          location: { directory },
          data: [{ id: "draft-test", name: "Draft", package: "provider" }],
        })
      if (path === "/api/agent") return Response.json({ location: { directory }, data: [] })
      if (path.endsWith("/agent") || path.endsWith("/model")) return new Response(null, { status: 204 })
      if (path.endsWith("/prompt")) return Response.json({})
      if (path.endsWith("/command")) return new Response(null, { status: 204 })
      if (path === "/api/event")
        return new Response(new ReadableStream({ start() {} }), { headers: { "Content-Type": "text/event-stream" } })
      throw new Error(`Unexpected request: ${request.method} ${path}`)
    }) as typeof fetch
    return requests
  }

  beforeEach(() => {
    const saved = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
        removeItem: (key: string) => saved.delete(key),
      },
    })
    setState({ server, session: session("previous"), status: "ready", error: "" })
  })
  afterEach(() => {
    disposeSessionSync()
    globalThis.fetch = originalFetch
    setState({ server: undefined, session: undefined, submitting: false, models: [], selectedModel: undefined })
    prompt.reset()
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage)
    else delete (globalThis as { localStorage?: Storage }).localStorage
  })

  describe("new session drafts", () => {
    test("New session clears the conversation and draft without creating or retaining a session ID", async () => {
      const requests = fixture()
      writeSessionRecord(session("previous"))
      expect(readSessionRecord()).toEqual({ id: "previous", directory: "/repo" })
      prompt.set("discard this draft")
      await startNewSession()
      expect(state.session).toBeUndefined()
      expect(currentRuntime()).toBeUndefined()
      expect(currentDirectory()).toBe("/repo")
      expect(state.sessionMessages).toEqual([])
      expect(state.sessionPending).toEqual([])
      expect(state.sessionStatus).toEqual({ type: "idle" })
      expect(prompt.current()).toBe("")
      expect(readSessionRecord()).toBeUndefined()
      await startNewSession()
      expect(requests.filter((request) => request.method === "POST")).toEqual([])
      expect(state.modelStatus).toBe("ready")
    })

    test("sends once after creation with the captured model, variant and attachments, preserving newer text", async () => {
      const created = Promise.withResolvers<Response>()
      const requests = fixture(() => created.promise)
      await startNewSession()
      const selection = createPromptModelSelection()
      selection.set({ providerID: "draft-test", modelID: "reasoning" })
      selection.variant.set("high")
      prompt.restore({
        prompt: "first message",
        attachments: [{ id: "image", filename: "image.png", mime: "image/png", url: "data:image/png;base64,YQ==" }],
      })
      const sending = submitPrompt()
      expect(state.submitting).toBe(true)
      expect(state.session).toBeUndefined()
      expect(submitPrompt()).toBeUndefined()
      prompt.set("next draft")
      selection.variant.set("low")
      created.resolve(Response.json({ data: session("created") }))
      await sending
      expect(requests.filter((request) => request.path === "/api/session" && request.method === "POST")).toEqual([
        { method: "POST", path: "/api/session", body: { agent: "7777", location: { directory: "/repo" } } },
      ])
      expect(requests.filter((request) => request.path.endsWith("/prompt"))).toEqual([
        {
          method: "POST",
          path: "/api/session/created/prompt",
          body: {
            id: state.sessionMessages[0].id,
            text: "first message",
            files: [{ uri: "data:image/png;base64,YQ==", name: "image.png" }],
            delivery: "steer",
            metadata: { agent: "7777", model: { providerID: "draft-test", modelID: "reasoning", variant: "high" } },
          },
        },
      ])
      expect(state.session?.id).toBe("created")
      expect(readSessionRecord()).toEqual({ id: "created", directory: "/repo" })
      expect(state.submitting).toBe(false)
      expect(prompt.current()).toBe("next draft")
      expect(selection.variant.current()).toBe("low")
    })

    test("creation failure restores the draft and permits a retry", async () => {
      let failing = true
      const requests = fixture(async () =>
        failing
          ? Response.json({ message: "creation failed" }, { status: 400 })
          : Response.json({ data: session("retry") }),
      )
      await startNewSession()
      prompt.set("retry this")
      await submitPrompt()
      expect(state.session).toBeUndefined()
      expect(prompt.current()).toBe("retry this")
      expect(state.submitting).toBe(false)
      expect(state.error).toContain("creation failed")
      failing = false
      await submitPrompt()
      expect(state.session?.id).toBe("retry")
      expect(requests.filter((request) => request.path.endsWith("/prompt"))).toHaveLength(1)
    })

    test.each(["success", "failure"])("ignores late creation %s after leaving the draft", async (outcome) => {
      const created = Promise.withResolvers<Response>()
      const requests = fixture(() => created.promise)
      await startNewSession()
      prompt.set("abandoned")
      const sending = submitPrompt()
      const previous = currentDraft()
      await activateDraft(server, directory)
      expect(currentDraft()).not.toBe(previous)
      prompt.set("replacement draft")
      created.resolve(
        outcome === "success"
          ? Response.json({ data: session("abandoned") })
          : Response.json({ message: "old creation failed" }, { status: 400 }),
      )
      await sending
      expect(state.session).toBeUndefined()
      expect(state.error).toBe("")
      expect(prompt.current()).toBe("replacement draft")
      expect(requests.filter((request) => request.path.endsWith("/prompt"))).toEqual([])
    })

    test("empty sends leave the draft local", async () => {
      const requests = fixture()
      await startNewSession()
      prompt.set("   ")
      expect(submitPrompt()).toBeUndefined()
      expect(requests.filter((request) => request.method === "POST")).toEqual([])
    })
  })
})
