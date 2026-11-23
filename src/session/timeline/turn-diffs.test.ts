import { afterEach, expect, jest, test } from "bun:test"
import type { FileDiffInfo, SessionMessageInfo } from "@opencode/client/promise"
import { createRoot, createSignal } from "solid-js"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import { createTurnDiffSource } from "./turn-diffs"

const user = (id: string): SessionMessageInfo => ({ id, type: "user", text: id, time: { created: 1 } })
const idle = (id: string): SessionMessageInfo => ({ id, type: "idle", outcome: "succeeded", time: { created: 2 } })
const turn = { sessionID: "active", from: "first" }
const patch = (file: string): FileDiffInfo => ({ file, patch: "", status: "modified", additions: 2, deletions: 1 })

browserSuite(import.meta.path, () => {
  const disposers: VoidFunction[] = []
  afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    jest.useRealTimers()
  })

  function fixture() {
    const [messages, setMessages] = createSignal([user("first"), user("steer"), idle("done")])
    const activation = new AbortController()
    const reads: { signal: AbortSignal; resolve: (value: FileDiffInfo[]) => void }[] = []
    const source = createRoot((dispose) => {
      disposers.push(dispose)
      return createTurnDiffSource({
        sessionID: turn.sessionID,
        messages,
        signal: activation.signal,
        diff: (_, options) => {
          const read = Promise.withResolvers<FileDiffInfo[]>()
          reads.push({ signal: options!.signal!, resolve: read.resolve })
          return read.promise
        },
      })
    })
    return { ...source, setMessages, activation, reads }
  }

  test("shares a steered turn's read and retires it when a new ending uses the same opener", async () => {
    const source = fixture()
    source.load(turn)
    source.setMessages([user("steer"), idle("done")])
    source.load({ ...turn, from: "steer" })
    expect(source.reads).toHaveLength(1)
    expect(source.reads[0].signal.aborted).toBe(false)

    source.setMessages([user("first"), idle("new-ending")])
    expect(source.reads[0].signal.aborted).toBe(true)
    source.load(turn)
    source.reads[1].resolve([patch("current")])
    source.reads[0].resolve([patch("old")])
    await Bun.sleep(0)
    expect(source.state(turn)).toEqual({ status: "ready", diffs: [patch("current")] })
    source.setMessages([user("first"), idle("new-ending")])
    source.load(turn)
    expect(source.reads).toHaveLength(2)
  })

  test("times out a stalled diff and cancels its retry on navigation", async () => {
    const source = fixture()
    jest.useFakeTimers()
    source.load(turn)
    jest.advanceTimersByTime(15_000)
    jest.useRealTimers()
    await Bun.sleep(0)
    expect(source.reads[0].signal.aborted).toBe(true)
    expect(source.state(turn)).toEqual({ status: "failed" })
    source.load(turn)
    source.reads[0].resolve([patch("late")])
    await Bun.sleep(0)
    expect(source.state(turn)).toEqual({ status: "loading" })
    source.activation.abort()
    expect(source.reads[1].signal.aborted).toBe(true)
    source.load(turn)
    expect(source.reads).toHaveLength(2)
  })

  test("evicting and then restoring the same turn starts a fresh read", async () => {
    const source = fixture()
    source.load(turn)
    source.load(turn)
    expect(source.reads).toHaveLength(1)
    source.setMessages([user("other"), idle("later")])
    expect(source.reads[0].signal.aborted).toBe(true)
    source.load(turn)
    expect(source.reads).toHaveLength(1)
    source.setMessages([user("first"), idle("done")])
    source.load(turn)
    source.reads[0].resolve([patch("evicted")])
    await Bun.sleep(0)
    expect(source.state(turn)).toEqual({ status: "loading" })
    source.reads[1].resolve([patch("restored")])
    await Bun.sleep(0)
    expect(source.state(turn)).toEqual({ status: "ready", diffs: [patch("restored")] })
  })
})
