import { afterEach, expect, test } from "bun:test"
import {
  OpenCode,
  type OpenCodeEvent,
  type SessionInboxInfo,
  type SessionInfo,
  type SessionMessageInfo,
  type SessionMessageUser,
} from "@opencode/client/promise"
import { unwrap } from "solid-js/store"
import { createCompactTimelineModel } from "@/session/timeline/model-compact"
import { createSessionRuntime } from "./runtime"
import { browserSuite } from "./runtime.test-fixture"

browserSuite(import.meta.path, () => {
  const disposers: (() => void)[] = []
  afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
  })
  const session = (): SessionInfo => ({
    id: "session",
    agent: "build",
    projectID: "project",
    location: { directory: "/repo" },
    title: "Session",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  })
  const user = (index: number): SessionMessageUser => ({
    id: `msg_${index.toString().padStart(3, "0")}`,
    type: "user",
    text: `prompt ${index}`,
    time: { created: index },
  })
  const inbox = (id = "pending", delivery: "queue" | "steer" = "queue"): SessionInboxInfo => ({
    id,
    sessionID: "session",
    type: "user",
    delivery,
    payload: { text: "pending prompt" },
    time: { created: 100 },
  })
  function fixture() {
    const requests: URL[] = []
    const failures: unknown[] = []
    const initial = session()
    let messages: SessionMessageInfo[] = []
    let pending: SessionInboxInfo[] = []
    let read: ((url: URL) => Promise<unknown> | unknown) | undefined
    let sequence = 0
    let publications = 0
    const client = OpenCode.make({
      baseUrl: "http://fixture.local",
      fetch: (async (input, init) => {
        const url = new URL(new Request(input, init).url)
        requests.push(url)
        const override = await read?.(url)
        if (override) return Response.json(override)
        if (url.pathname.endsWith("/inbox")) return Response.json({ data: pending })
        if (url.pathname.endsWith("/message")) return Response.json({ data: messages.toReversed(), cursor: {} })
        if (url.pathname === "/api/session/session") return Response.json({ data: initial })
        if (url.pathname.includes("/message/")) {
          const id = url.pathname.split("/").at(-1)
          const row = messages.find((row) => row.id === id)
          if (row) return Response.json({ data: row })
        }
        throw new Error(`Unexpected fixture request: ${url.pathname}`)
      }) as typeof fetch,
    })
    const runtime = createSessionRuntime({
      client,
      session: initial,
      changed: () => publications++,
      error: (error) => failures.push(error),
    })
    disposers.push(runtime.dispose)
    const emit = (type: string, data: object, extra: object = {}) =>
      runtime.apply({
        id: `evt_${++sequence}`,
        created: 100 + sequence,
        type,
        data: { sessionID: "session", ...data },
        location: { directory: "/repo" },
        durable: { aggregateID: "session", seq: sequence, version: 1 },
        ...extra,
      } as OpenCodeEvent)
    return {
      runtime,
      emit,
      initial,
      requests,
      failures,
      publications: () => publications,
      snapshot: (rows: SessionMessageInfo[], items: SessionInboxInfo[] = []) => {
        messages = rows
        pending = items
      },
      read: (handler: typeof read) => {
        read = handler
      },
      rows: () => structuredClone(unwrap(runtime.view().sessionMessages)),
      pending: () => structuredClone(unwrap(runtime.view().sessionPending)),
    }
  }

  test("hydrates nine dialogs through shared cursor reads and leaves visible history bounded", async () => {
    const f = fixture()
    f.read((url) => {
      if (!url.pathname.endsWith("/message")) return
      if (!url.searchParams.has("cursor")) return { data: [user(11), user(10)], cursor: { next: "older" } }
      return { data: Array.from({ length: 9 }, (_, index) => user(9 - index)), cursor: { next: "unused" } }
    })
    await f.runtime.refreshMessages()
    const reads = f.requests.filter((url) => url.pathname.endsWith("/message"))
    expect(reads.map((url) => [url.searchParams.get("limit"), url.searchParams.get("cursor")])).toEqual([
      ["36", null],
      ["20", "older"],
    ])
    const timeline = createCompactTimelineModel({
      sessionID: () => "session",
      messages: () => f.runtime.view().sessionMessages,
      loading: () => false,
    })
    expect(timeline.userDialogCount()).toBe(9)
    expect(timeline.visibleMessages().map((row) => row.id)).toEqual(
      Array.from({ length: 9 }, (_, index) => user(index + 3).id),
    )
  })

  test.each(["empty", "repeat", "duplicate"])("stops %s cursor pages without looping", async (mode) => {
    const f = fixture()
    f.read((url) =>
      url.pathname.endsWith("/message")
        ? {
            data: mode === "empty" && url.searchParams.has("cursor") ? [] : [user(1)],
            cursor: { next: mode === "duplicate" ? String(f.requests.length) : "same" },
          }
        : undefined,
    )
    await f.runtime.refreshMessages()
    expect(f.rows()).toEqual([user(1)])
    expect(f.requests.filter((url) => url.pathname.endsWith("/message"))).toHaveLength(2)
  })

  test("queue hydration, promotion and cancellation use one shared inbox without consuming dialogs", async () => {
    const f = fixture()
    f.snapshot([user(1)], [inbox()])
    await f.runtime.refreshMessages()
    expect(f.rows()).toEqual([user(1)])
    expect(f.pending()).toEqual([inbox()])
    f.emit("session.inbox.delivered", { inboxID: "pending" })
    expect(f.pending()).toEqual([])
    expect(f.rows().map((row) => row.id)).toEqual(["msg_001", "pending"])
    f.emit("session.inbox.enqueued", {
      inboxID: "cancel",
      item: { type: "user", delivery: "steer", payload: { text: "cancelled" } },
    })
    f.emit("session.inbox.cancelled", { inboxID: "cancel" })
    expect(f.rows().map((row) => row.id)).toEqual(["msg_001", "pending"])
  })

  test("projects delivery events immediately after HTTP-only admission", () => {
    const f = fixture()
    f.runtime.updatePending(() => [inbox()])
    f.emit("session.inbox.delivery.changed", { inboxID: "pending", delivery: "steer" })
    expect(f.rows()).toMatchObject([{ id: "pending", text: "pending prompt" }])
    f.emit("session.inbox.delivery.changed", { inboxID: "pending", delivery: "queue" })
    expect(f.rows()).toEqual([])
    f.emit("session.inbox.delivered", { inboxID: "pending" })
    expect(f.pending()).toEqual([])
    expect(f.rows()).toMatchObject([{ id: "pending", text: "pending prompt", time: { created: 103 } }])
  })

  test("an inbox cancellation overtaking a snapshot cannot restore the item", async () => {
    const f = fixture()
    const held = Promise.withResolvers<unknown>()
    let reading = false
    f.read((url) => {
      if (url.pathname.endsWith("/inbox")) {
        reading = true
        return held.promise
      }
    })
    const refresh = f.runtime.refreshMessages()
    await Bun.sleep(0)
    expect(reading).toBe(true)
    f.emit("session.inbox.cancelled", { inboxID: "pending" })
    held.resolve({ data: [inbox()] })
    await refresh
    expect(f.pending()).toEqual([])
    expect(f.rows()).toEqual([])
  })

  test("retains live assistant, compaction and shell rows across history refreshes", async () => {
    const f = fixture()
    f.snapshot([user(1)])
    await f.runtime.refreshMessages()
    f.emit("session.step.started", {
      assistantMessageID: "assistant",
      started: 102,
      agent: "build",
      model: { id: "model", providerID: "provider" },
    })
    f.emit("session.text.started", { assistantMessageID: "assistant", ordinal: 0 })
    f.emit("session.text.delta", { assistantMessageID: "assistant", ordinal: 0, delta: "live" })
    f.emit("session.compaction.started", { inputID: "compaction", reason: "manual" })
    f.emit(
      "session.shell.started",
      { shell: { id: "shell", command: "pwd", status: "running", metadata: { background: true } } },
      { id: "evt_shell" },
    )
    await f.runtime.refreshMessages()
    expect(f.rows().map((row) => row.id)).toEqual(["msg_001", "assistant", "compaction", "msg_shell"])
    expect(f.rows().find((row) => row.id === "assistant")).toMatchObject({ content: [{ type: "text", text: "live" }] })
    expect(f.rows().find((row) => row.id === "msg_shell")).toMatchObject({ metadata: { background: true } })
    const incomplete = f.rows().map((row) => (row.type === "assistant" ? { ...row, content: [] } : row))
    f.snapshot(incomplete)
    await f.runtime.refreshMessages()
    expect(f.rows().find((row) => row.id === "assistant")).toMatchObject({ content: [{ type: "text", text: "live" }] })
    const completed = f
      .rows()
      .map((row) => (row.id === "assistant" ? { ...row, time: { ...row.time, completed: 200 } } : row))
    f.snapshot(completed)
    await f.runtime.refreshMessages()
    expect(f.rows().find((row) => row.id === "assistant")).toMatchObject({ time: { completed: 200 } })
  })

  test("events arriving during a stale read win without losing their next streamed delta", async () => {
    const f = fixture()
    f.snapshot([user(1)])
    await f.runtime.refreshMessages()
    f.emit("session.step.started", {
      assistantMessageID: "assistant",
      started: 101,
      agent: "build",
      model: { id: "model", providerID: "provider" },
    })
    f.emit("session.text.started", { assistantMessageID: "assistant", ordinal: 0 })
    const held = Promise.withResolvers<unknown>()
    f.read((url) => (url.pathname.endsWith("/message") ? held.promise : undefined))
    const refresh = f.runtime.refreshMessages()
    await Bun.sleep(0)
    f.emit("session.text.delta", { assistantMessageID: "assistant", ordinal: 0, delta: "new" })
    held.resolve({ data: [user(1)], cursor: {} })
    await refresh
    f.emit("session.text.delta", { assistantMessageID: "assistant", ordinal: 0, delta: " text" })
    expect(f.rows().find((row) => row.id === "assistant")).toMatchObject({
      content: [{ type: "text", text: "new text" }],
    })
  })

  test("shared tool, reasoning, generated-file and retry projections survive compact publication", () => {
    const f = fixture()
    const target = { assistantMessageID: "assistant" }
    f.emit("session.step.started", {
      ...target,
      started: 101,
      agent: "build",
      model: { id: "model", providerID: "provider" },
    })
    f.emit("session.reasoning.started", { ...target, ordinal: 0 })
    f.emit("session.reasoning.delta", { ...target, ordinal: 0, delta: "thinking" })
    f.emit("session.reasoning.ended", { ...target, ordinal: 0, text: "thought" })
    f.emit("session.tool.input.started", { ...target, ordinal: 1, id: "call", name: "read" })
    f.emit("session.tool.called", { ...target, id: "call", input: { path: "file" } })
    f.emit("session.tool.success", { ...target, id: "call", content: [{ type: "text", text: "result" }], metadata: {} })
    const file = {
      type: "file",
      id: "generated",
      mime: "image/png",
      url: "data:image/png;base64,aGk=",
      filename: "image.png",
    }
    f.emit("session.file.generated", { ...target, file })
    f.emit("session.retry.scheduled", { ...target, attempt: 2, at: 300, error: { message: "retry" } })
    const assistant = f.rows().find((row) => row.type === "assistant")
    expect(assistant).toMatchObject({
      retry: { attempt: 2 },
      content: [
        { type: "reasoning", text: "thought" },
        { type: "tool", state: { status: "completed" } },
        { type: "file" },
      ],
    })
    f.emit("session.execution.interrupted", { reason: "user" })
    expect(f.runtime.view().sessionStatus).toEqual({ type: "idle" })
    expect(f.rows().find((row) => row.type === "assistant")).not.toHaveProperty("retry")
  })

  test("preserves skill rows and durable selection predecessors without mutating server inputs", () => {
    const f = fixture()
    const before = structuredClone(f.initial)
    f.emit("session.skill.activated", { id: "review", name: "Review", text: "Instructions" })
    f.emit("session.agent.selected", { agent: "plan", previous: "review" })
    expect(f.rows()).toMatchObject([
      { type: "skill", skill: "review", name: "Review", text: "Instructions" },
      { type: "agent-switched", previous: "review" },
    ])
    expect(f.initial).toEqual(before)
    expect(f.runtime.data.session.get("session").agent).toBe("plan")
  })

  test("keeps optimistic attachment previews until the admission echo and honors HTTP cancellation", () => {
    const f = fixture()
    const echo = {
      ...user(1),
      files: [{ mime: "text/plain", name: "note", data: "aGk=", source: { type: "inline" as const } }],
    }
    f.runtime.echo(echo)
    expect(f.rows()[0]).toEqual(echo)
    f.emit("session.inbox.enqueued", {
      inboxID: echo.id,
      item: { type: "user", delivery: "steer", payload: { text: "durable", files: echo.files } },
    })
    expect(f.rows()).toHaveLength(1)
    expect(f.rows()[0]).toMatchObject({ text: "durable", files: echo.files })
    f.runtime.updatePending(() => [])
    expect(f.rows()).toEqual([])
    expect(f.pending()).toEqual([])
    expect(echo.text).toBe("prompt 1")
  })

  test("completed shells and compactions win over a history read already in flight", async () => {
    const f = fixture()
    f.emit(
      "session.shell.started",
      { shell: { id: "shell", command: "pwd", status: "running", metadata: { background: true } } },
      { id: "evt_shell" },
    )
    f.emit("session.compaction.started", { inputID: "compact", reason: "manual" })
    const held = Promise.withResolvers<unknown>()
    f.read((url) => (url.pathname.endsWith("/message") ? held.promise : undefined))
    const refreshing = f.runtime.refreshMessages()
    await Bun.sleep(0)
    f.emit("session.shell.ended", { shell: { id: "shell", status: "completed", exit: 0 }, output: "/repo" })
    f.emit("session.compaction.ended", { reason: "manual", text: "Summary", recent: [], cost: 0, tokens: {} })
    held.resolve({ data: [], cursor: {} })
    await refreshing
    expect(f.rows()).toMatchObject([
      { id: "msg_shell", status: "completed", output: "/repo", metadata: { background: true } },
      { id: "compact", status: "completed", summary: "Summary" },
    ])
  })

  test("hydrates a delivered input whose admission event was missed", async () => {
    const f = fixture()
    f.snapshot([user(1)])
    f.emit("session.inbox.delivered", { inboxID: "msg_001" })
    await Bun.sleep(180)
    expect(f.rows()).toEqual([user(1)])
    expect(f.requests.some((url) => url.pathname.endsWith("/message"))).toBe(true)
  })

  test("projects instructions and movement through the shared session store", () => {
    const f = fixture()
    f.emit("session.instructions.updated", { delta: { agents: "hash" }, text: "Changed instructions" })
    f.emit("session.moved", { projectID: "next", location: { directory: "/next" }, subpath: "src" })
    expect(f.rows()).toMatchObject([
      { type: "system", text: "Changed instructions", description: "Instructions updated: agents" },
      {
        type: "location-switched",
        location: { directory: "/next" },
        previous: { projectID: "project", location: { directory: "/repo" } },
      },
    ])
    expect(f.runtime.view().session.location.directory).toBe("/next")
  })

  test("HTTP mutation receipts survive older reads and retire on subsequent snapshots", async () => {
    const f = fixture()
    f.snapshot([], [inbox()])
    await f.runtime.refreshMessages()
    const held = Promise.withResolvers<unknown>()
    f.read((url) => (url.pathname.endsWith("/inbox") ? held.promise : undefined))
    const refreshing = f.runtime.refreshMessages()
    await Bun.sleep(0)
    f.runtime.updatePending((items) => items.map((item) => ({ ...item, delivery: "steer" })))
    held.resolve({ data: [inbox()] })
    await refreshing
    expect(f.pending()).toEqual([inbox("pending", "steer")])
    f.read(undefined)
    f.snapshot([{ ...user(1), id: "pending" }])
    await f.runtime.refreshMessages()
    expect(f.pending()).toEqual([])
    expect(f.rows()).toHaveLength(1)
  })

  test("session refresh cannot overwrite a newer successful revert", async () => {
    const f = fixture()
    const held = Promise.withResolvers<unknown>()
    f.read((url) => (url.pathname === "/api/session/session" ? held.promise : undefined))
    f.runtime.data.session.invalidate("session")
    const refreshing = f.runtime.data.session.sync("session")
    await Bun.sleep(0)
    f.runtime.setSession({ ...f.initial, revert: { messageID: "msg_001" } })
    held.resolve({ data: f.initial })
    await refreshing
    expect(f.runtime.view().session.revert).toEqual({ messageID: "msg_001" })
  })

  test("disposal isolates late reads and suppresses later events and publications", async () => {
    const f = fixture()
    const held = Promise.withResolvers<unknown>()
    f.read((url) => (url.pathname.endsWith("/message") ? held.promise : undefined))
    const refresh = f.runtime.refreshMessages().catch(() => undefined)
    await Bun.sleep(0)
    f.runtime.dispose()
    const publications = f.publications()
    held.resolve({ data: [user(1)], cursor: {} })
    await refresh
    expect(f.publications()).toBe(publications)
    expect(f.runtime.alive()).toBe(false)
    expect(f.emit("session.execution.started", {})).toBe(false)
    expect(f.failures).toEqual([])
  })

  test("does not run full-app bootstrap on a connection event", async () => {
    const f = fixture()
    expect(f.emit("server.connected", {})).toBe(false)
    await Bun.sleep(0)
    expect(f.requests).toEqual([])
  })
})
