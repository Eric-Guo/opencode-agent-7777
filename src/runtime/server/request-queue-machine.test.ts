import { describe, expect, test } from "bun:test"
import { createRequestQueueState, transitionRequestQueue, type RequestQueueEvent } from "./request-queue-machine"

const config = { limit: 2, slowLimit: 1, stallMs: 2_000 }

function arrival(url: string, now = 0, slow = false): RequestQueueEvent {
  return { type: "request.arrived", method: "GET", url, now, slow }
}

function setup(limit = config.limit) {
  let state = createRequestQueueState()
  return {
    state: () => state,
    send(event: RequestQueueEvent) {
      const result = transitionRequestQueue(state, event, { ...config, limit })
      state = result.state
      return result.effects
    },
  }
}

describe("request queue machine", () => {
  test("grants the oldest eligible request without mutating earlier snapshots", () => {
    const queue = setup()
    const initial = queue.state()
    expect(queue.send(arrival("slow-a", 0, true))).toEqual([{ type: "request.start", id: 1 }])
    queue.send(arrival("fast-a"))
    expect(queue.send(arrival("slow-b", 10, true))).toEqual([{ type: "watcher.start", delayMs: 2_000 }])
    queue.send(arrival("fast-b", 20))
    queue.send(arrival("fast-c", 30))
    const before = queue.state()

    expect(queue.send({ type: "request.settled", id: 2, now: 100 })).toEqual([{ type: "request.start", id: 4 }])
    expect(queue.state().inflight.map(({ id, at }) => ({ id, at }))).toEqual([
      { id: 1, at: 0 },
      { id: 4, at: 100 },
    ])
    expect(queue.send({ type: "request.settled", id: 1, now: 200 })).toEqual([{ type: "request.start", id: 3 }])
    expect(queue.send({ type: "request.settled", id: 4, now: 300 })).toEqual([
      { type: "watcher.stop" },
      { type: "request.start", id: 5 },
    ])
    expect(queue.state()).toEqual({
      status: "running",
      nextId: 6,
      warnedAt: -Infinity,
      inflight: [
        { id: 3, method: "GET", url: "slow-b", slow: true, at: 200 },
        { id: 5, method: "GET", url: "fast-c", slow: false, at: 300 },
      ],
    })
    expect(initial).toEqual({ status: "running", nextId: 1, warnedAt: -Infinity, inflight: [] })
    expect(before).toEqual({
      status: "queued",
      nextId: 6,
      warnedAt: -Infinity,
      inflight: [
        { id: 1, method: "GET", url: "slow-a", slow: true, at: 0 },
        { id: 2, method: "GET", url: "fast-a", slow: false, at: 0 },
      ],
      waiting: [
        { id: 3, method: "GET", url: "slow-b", slow: true, at: 10 },
        { id: 4, method: "GET", url: "fast-b", slow: false, at: 20 },
        { id: 5, method: "GET", url: "fast-c", slow: false, at: 30 },
      ],
    })
  })

  test("rejects queued settlements and stale events, and stops watching after the last cancellation", () => {
    const queue = setup(1)
    queue.send(arrival("active"))
    queue.send(arrival("cancelled"))
    queue.send(arrival("waiting"))
    const before = queue.state()
    for (const event of [
      { type: "request.settled", id: 2, now: 1 },
      { type: "request.aborted", id: 99, now: 1 },
    ] as const) {
      expect(queue.send(event)).toEqual([])
      expect(queue.state()).toBe(before)
    }
    expect(queue.send({ type: "request.aborted", id: 2, now: 2 })).toEqual([])
    const cancelled = queue.state()
    expect(queue.send({ type: "request.aborted", id: 2, now: 3 })).toEqual([])
    expect(queue.state()).toBe(cancelled)
    expect(queue.send({ type: "request.aborted", id: 3, now: 4 })).toEqual([{ type: "watcher.stop" }])
    const running = queue.state()
    expect(running.status).toBe("running")
    expect(queue.send({ type: "watch.due", now: 20_000 })).toEqual([])
    expect(queue.state()).toBe(running)
  })

  test("cancellation after a grant releases exactly that slot and ignores its late completion", () => {
    const queue = setup(1)
    queue.send(arrival("active"))
    queue.send(arrival("cancel-after-grant"))
    queue.send(arrival("next"))
    queue.send(arrival("last"))
    expect(queue.send({ type: "request.settled", id: 1, now: 10 })).toEqual([{ type: "request.start", id: 2 }])
    expect(queue.send({ type: "request.aborted", id: 2, now: 11 })).toEqual([{ type: "request.start", id: 3 }])
    const current = queue.state()
    for (const id of [1, 2]) {
      expect(queue.send({ type: "request.settled", id, now: 12 })).toEqual([])
      expect(queue.state()).toBe(current)
    }
    expect(queue.send({ type: "request.settled", id: 3, now: 20 })).toEqual([
      { type: "watcher.stop" },
      { type: "request.start", id: 4 },
    ])
  })

  test("preserves the stall threshold, payload and cooldown across bursts", () => {
    const queue = setup(1)
    queue.send(arrival("active", 0))
    queue.send(arrival("waiting", 100))
    const before = queue.state()
    expect(queue.send({ type: "watch.due", now: 2_099 })).toEqual([{ type: "watcher.start", delayMs: 2_000 }])
    expect(queue.state()).toBe(before)
    expect(queue.send({ type: "watch.due", now: 2_100 })).toEqual([
      { type: "watcher.start", delayMs: 2_000 },
      {
        type: "log.stall",
        data: {
          limit: 1,
          inflight: [{ method: "GET", url: "active", ms: 2_100 }],
          queued: [{ method: "GET", url: "waiting", ms: 2_000 }],
        },
      },
    ])
    queue.send({ type: "request.aborted", id: 2, now: 2_200 })
    queue.send(arrival("another-wait", 2_300))
    const cooldown = queue.state()
    expect(queue.send({ type: "watch.due", now: 12_099 })).toEqual([{ type: "watcher.start", delayMs: 2_000 }])
    expect(queue.state()).toBe(cooldown)
    expect(queue.send({ type: "watch.due", now: 12_100 })).toEqual([
      { type: "watcher.start", delayMs: 2_000 },
      {
        type: "log.stall",
        data: {
          limit: 1,
          inflight: [{ method: "GET", url: "active", ms: 12_100 }],
          queued: [{ method: "GET", url: "another-wait", ms: 9_800 }],
        },
      },
    ])
  })
})
