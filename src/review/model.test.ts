import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test"
import type { FileDiffInfo, OpenCodeEvent, VcsDiffInput } from "@opencode/client/promise"
import { createReviewModel } from "./model"

const diffs = (): FileDiffInfo[] => [
  { file: "notes.txt", patch: "@@ -1 +1 @@\n-before\n+after\n", additions: 1, deletions: 1, status: "modified" },
]

function fixture(directory = "/workspace") {
  const abort = new AbortController()
  const calls: {
    input: { sessionID: string; context?: number } | VcsDiffInput
    signal?: AbortSignal
    response: ReturnType<typeof Promise.withResolvers<FileDiffInfo[]>>
  }[] = []
  const model = createReviewModel({
    sessionID: "session",
    directory,
    signal: abort.signal,
    client: {
      session: {
        diff(input, options) {
          const response = Promise.withResolvers<FileDiffInfo[]>()
          calls.push({ input, signal: options?.signal, response })
          return response.promise
        },
      },
      vcs: {
        diff(input, options) {
          const response = Promise.withResolvers<FileDiffInfo[]>()
          calls.push({ input, signal: options?.signal, response })
          return response.promise.then((data) => ({ location: { directory }, data }))
        },
      },
    },
  })
  return { model, calls, abort }
}

test("review is demand-loaded and requests bounded patches for the captured session", async () => {
  const { model, calls } = fixture()
  expect(calls).toHaveLength(0)
  const pending = model.refresh()
  expect(model.state.status).toBe("loading")
  expect(calls[0].input).toEqual({ sessionID: "session", context: 3 })
  calls[0].response.resolve(diffs())
  await pending
  expect(model.state.diffs).toEqual(diffs())
  expect(model.state.status).toBe("ready")
  expect(model.state.error).toBeUndefined()
})

test.each([false, true])("changing sources discards superseded results and errors (failed=%s)", async (failed) => {
  const { model, calls } = fixture()
  const initial = model.refresh()
  calls[0].response.resolve(diffs())
  await initial
  const old = model.refresh()
  const working = model.select({ mode: "working" })
  expect(calls[1].signal?.aborted).toBe(true)
  expect(calls[2].input).toEqual({ location: { directory: "/workspace" }, mode: "working", context: 3 })
  expect(model.state.diffs).toEqual([])
  calls[2].response.resolve([{ ...diffs()[0], file: "working.txt" }])
  await working
  if (failed) calls[1].response.reject(new Error("old turn failure"))
  else calls[1].response.resolve(diffs())
  await old
  expect(model.state.diffs).toEqual([{ ...diffs()[0], file: "working.txt" }])
  expect(model.state.source).toEqual({ mode: "working" })
  expect(model.state.error).toBeUndefined()
  model.dispose()
})

test.each(["branch", "committed"] as const)(
  "%s base references retry unchanged and stay scoped to comparisons",
  async (mode) => {
    const { model, calls } = fixture()
    const comparison = model.select({ mode, base: "  release/v2  " })
    expect(calls[0].input).toEqual({
      location: { directory: "/workspace" },
      mode,
      base: "release/v2",
      context: 3,
    })
    calls[0].response.reject(new Error("Unknown ref"))
    await comparison
    expect(model.state.error).toEqual(new Error("Unknown ref"))
    const retry = model.refresh()
    expect(calls[1].input).toEqual(calls[0].input)
    calls[1].response.resolve([])
    await retry
    expect(model.state.error).toBeUndefined()
    expect(model.state.diffs).toEqual([])
    await model.select({ mode, base: "release/v2" })
    expect(calls).toHaveLength(2)
    const defaultBranch = model.select({ mode, base: "  " })
    expect(calls[2].input).toEqual({ location: { directory: "/workspace" }, mode, context: 3 })
    calls[2].response.resolve([])
    await defaultBranch
    const turn = model.select({ mode: "turn", base: "release/v2" })
    expect(calls[3].input).toEqual({ sessionID: "session", context: 3 })
    expect(model.state.source).toEqual({ mode: "turn" })
    calls[3].response.resolve(diffs())
    await turn
    expect(model.state.diffs).toEqual(diffs())
    const working = model.select({ mode: "working", base: "release/v2" })
    expect(calls[4].input).toEqual({ location: { directory: "/workspace" }, mode: "working", context: 3 })
    calls[4].response.resolve([])
    await working
    model.dispose()
  },
)

test.each([false, true])(
  "switching branch to committed with the same base discards the old read (failed=%s)",
  async (failed) => {
    const { model, calls } = fixture()
    const branch = model.select({ mode: "branch", base: "release/v2" })
    const committed = model.select({ mode: "committed", base: "release/v2" })
    expect(calls[0].signal?.aborted).toBe(true)
    expect(calls[1].input).toEqual({
      location: { directory: "/workspace" },
      mode: "committed",
      base: "release/v2",
      context: 3,
    })
    calls[1].response.resolve([])
    await committed
    if (failed) calls[0].response.reject(new Error("old branch failure"))
    else calls[0].response.resolve(diffs())
    await branch
    expect(model.state.source).toEqual({ mode: "committed", base: "release/v2" })
    expect(model.state.diffs).toEqual([])
    expect(model.state.status).toBe("ready")
    expect(model.state.error).toBeUndefined()
    model.dispose()
  },
)

test.each(["close", "activation"])("%s aborts a VCS read and blocks source changes", async (reason) => {
  const { model, calls, abort } = fixture()
  const pending = model.select({ mode: "committed", base: "release/v2" })
  if (reason === "close") model.dispose()
  else abort.abort()
  expect(calls[0].signal?.aborted).toBe(true)
  calls[0].response.resolve(diffs())
  await pending
  await model.select({ mode: "branch" })
  expect(calls).toHaveLength(1)
  expect(model.state.source).toEqual({ mode: "committed", base: "release/v2" })
  expect(model.state.diffs).toEqual([])
  model.dispose()
})

describe("review file events", () => {
  const changed = (directory?: string): OpenCodeEvent => ({
    type: "filesystem.changed",
    id: "changed",
    created: 1,
    location: directory === undefined ? undefined : { directory },
    data: { file: "/workspace/notes.txt", event: "change" },
  })
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  test.each([
    ["working", "/workspace", "/workspace/", "/Workspace"],
    ["branch", "C:\\Work\\Agent", "c:/work/agent/", "C:/Work/Other"],
    ["committed", "//host/share/Repo", "//HOST/share/repo/", "//host/share/Other"],
  ] as const)(
    "%s refreshes 100 ms after the last matching file event in %s",
    async (mode, directory, equivalent, other) => {
      const { model, calls, abort } = fixture(directory)
      model.event(changed(directory))
      jest.advanceTimersByTime(100)
      expect(calls).toHaveLength(0)

      const initial = model.select({ mode })
      model.event(changed())
      model.event(changed(other))
      model.event(changed(directory + "/sub"))
      jest.advanceTimersByTime(100)
      expect(calls).toHaveLength(1)

      model.event(changed(directory))
      jest.advanceTimersByTime(99)
      model.event(changed(equivalent))
      calls[0].response.resolve([])
      await initial
      jest.advanceTimersByTime(50)
      model.event(changed(other))
      jest.advanceTimersByTime(49)
      expect(calls).toHaveLength(1)
      jest.advanceTimersByTime(1)
      expect(calls).toHaveLength(2)
      expect(calls[1].input).toEqual({ location: { directory }, mode, context: 3 })

      model.event(changed(directory))
      abort.abort()
      jest.advanceTimersByTime(100)
      expect(calls).toHaveLength(2)
    },
  )

  test("immediate reads consume a pending file refresh for the active comparison", () => {
    const { model, calls } = fixture()
    model.select({ mode: "branch", base: "release" })
    for (const event of [
      { type: "server.connected", id: "hello", data: {} },
      {
        type: "session.execution.succeeded",
        id: "done",
        created: 1,
        durable: { aggregateID: "session", seq: 1, version: 1 },
        data: { sessionID: "session" },
      },
    ] satisfies OpenCodeEvent[]) {
      const before = calls.length
      model.event(changed("/workspace"))
      jest.advanceTimersByTime(99)
      model.event(event)
      expect(calls).toHaveLength(before + 1)
      expect(calls.at(-1)?.input).toEqual({
        location: { directory: "/workspace" },
        mode: "branch",
        base: "release",
        context: 3,
      })
      jest.advanceTimersByTime(100)
      expect(calls).toHaveLength(before + 1)
    }
    model.dispose()
  })

  test("changing comparison or closing retires the queued refresh", () => {
    const { model, calls } = fixture()
    model.select({ mode: "committed", base: "one" })
    model.event(changed("/workspace"))
    model.select({ mode: "committed", base: "two" })
    jest.advanceTimersByTime(100)
    expect(calls).toHaveLength(2)
    model.event(changed("/workspace"))
    model.dispose()
    model.event(changed("/workspace"))
    jest.advanceTimersByTime(100)
    expect(calls).toHaveLength(2)
  })
})

test.each([false, true])("a newer review read wins over a late response (failed=%s)", async (failed) => {
  const { model, calls } = fixture()
  const old = model.refresh()
  const next = model.refresh()
  expect(calls[0].signal?.aborted).toBe(true)
  calls[1].response.resolve([])
  await next
  if (failed) calls[0].response.reject(new Error("old failure"))
  else calls[0].response.resolve(diffs())
  await old
  expect(model.state.diffs).toEqual([])
  expect(model.state.status).toBe("ready")
  expect(model.state.error).toBeUndefined()
})

test.each(["close", "activation"])("%s aborts reads and prevents later refreshes", async (reason) => {
  const { model, calls, abort } = fixture()
  const pending = model.refresh()
  if (reason === "close") model.dispose()
  else abort.abort()
  expect(calls[0].signal?.aborted).toBe(true)
  calls[0].response.resolve(diffs())
  await pending
  await model.refresh()
  expect(calls).toHaveLength(1)
  expect(model.state.diffs).toEqual([])
  expect(model.state.error).toBeUndefined()
})

test("a failed read can be retried, including a valid empty result", async () => {
  const { model, calls } = fixture()
  const failed = model.refresh()
  calls[0].response.reject(new Error("offline"))
  await failed
  expect(model.state.error).toEqual(new Error("offline"))
  expect(model.state.status).toBe("error")
  const retry = model.refresh()
  expect(model.state.error).toBeUndefined()
  calls[1].response.resolve([])
  await retry
  expect(model.state.diffs).toEqual([])
  expect(model.state.status).toBe("ready")
})

test.each(["turn", "branch"] as const)("a stalled %s read expires and cannot overwrite its retry", async (mode) => {
  jest.useFakeTimers()
  const { model, calls } = fixture()
  try {
    const pending = mode === "turn" ? model.refresh() : model.select({ mode, base: "release/v2" })
    jest.advanceTimersByTime(29_999)
    expect(calls[0].signal?.aborted).toBe(false)
    jest.advanceTimersByTime(1)
    expect(calls[0].signal?.aborted).toBe(true)
    // The transport deliberately ignores cancellation. Refresh still settles when the deadline passes.
    await pending
    expect(model.state.status).toBe("timed-out")
    jest.useRealTimers()
    const retry = model.refresh()
    expect(calls[1].input).toEqual(calls[0].input)
    calls[0].response.resolve(diffs())
    await Bun.sleep(0)
    expect(model.state.status).toBe("loading")
    expect(model.state.diffs).toEqual([])
    calls[1].response.resolve([])
    await retry
    expect(model.state.status).toBe("ready")
    expect(model.state.diffs).toEqual([])
  } finally {
    model.dispose()
    jest.useRealTimers()
  }
})

test("review refreshes on reconnect, completion and revert, excluding other sessions and streaming deltas", () => {
  const { model, calls } = fixture()
  const event = (type: OpenCodeEvent["type"], sessionID = "session") =>
    ({ type, id: "event", created: 1, data: { sessionID } }) as OpenCodeEvent
  model.event(event("session.text.delta"))
  model.event(event("session.execution.succeeded", "other"))
  expect(calls).toHaveLength(0)
  for (const type of [
    "server.connected",
    "session.execution.succeeded",
    "session.execution.failed",
    "session.execution.interrupted",
    "session.revert.staged",
    "session.revert.cleared",
    "session.revert.committed",
  ] as const) {
    model.event(event(type))
  }
  expect(calls).toHaveLength(7)
  model.dispose()
  model.event(event("server.connected"))
  expect(calls).toHaveLength(7)
  expect(calls.every((call) => call.signal?.aborted)).toBe(true)
})
