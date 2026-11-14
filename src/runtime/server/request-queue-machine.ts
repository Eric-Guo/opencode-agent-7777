export type RequestQueueConfig = { readonly limit: number; readonly slowLimit: number; readonly stallMs: number }

type RequestEntry = {
  readonly id: number
  readonly method: string
  readonly url: string
  // Arrival time while queued; dispatch time once a slot is granted.
  readonly at: number
  readonly slow: boolean
}

type QueueData = {
  readonly nextId: number
  readonly warnedAt: number
  readonly inflight: readonly RequestEntry[]
}

export type RequestQueueState = QueueData &
  ({ readonly status: "running" } | { readonly status: "queued"; readonly waiting: readonly RequestEntry[] })

export type RequestQueueEvent =
  | {
      readonly type: "request.arrived"
      readonly method: string
      readonly url: string
      readonly slow: boolean
      readonly now: number
    }
  | { readonly type: "request.settled" | "request.aborted"; readonly id: number; readonly now: number }
  | { readonly type: "watch.due"; readonly now: number }

type StallItem = { readonly method: string; readonly url: string; readonly ms: number }

export type RequestQueueEffect =
  | { readonly type: "request.start"; readonly id: number }
  | { readonly type: "watcher.start"; readonly delayMs: number }
  | { readonly type: "watcher.stop" }
  | {
      readonly type: "log.stall"
      readonly data: {
        readonly limit: number
        readonly inflight: readonly StallItem[]
        readonly queued: readonly StallItem[]
      }
    }

type Transition = { readonly state: RequestQueueState; readonly effects: readonly RequestQueueEffect[] }

const NO_EFFECTS: readonly RequestQueueEffect[] = Object.freeze([])
const STOP_WATCHER: RequestQueueEffect = Object.freeze({ type: "watcher.stop" })
const REQUEST_STALL_COOLDOWN_MS = 10_000

export function createRequestQueueState(): RequestQueueState {
  return { status: "running", nextId: 1, warnedAt: -Infinity, inflight: [] }
}

export function selectInflightCount(state: RequestQueueState) {
  return state.inflight.length
}

export function selectQueuedCount(state: RequestQueueState) {
  return state.status === "queued" ? state.waiting.length : 0
}

export function isRequestInflight(state: RequestQueueState, id: number) {
  return state.inflight.some((entry) => entry.id === id)
}

export function transitionRequestQueue(
  state: RequestQueueState,
  event: RequestQueueEvent,
  config: RequestQueueConfig,
): Transition {
  if (event.type === "watch.due") {
    if (state.status === "running") return { state, effects: NO_EFFECTS }
    const watch: RequestQueueEffect = { type: "watcher.start", delayMs: config.stallMs }
    if (event.now - state.waiting[0]!.at < config.stallMs || event.now - state.warnedAt < REQUEST_STALL_COOLDOWN_MS)
      return { state, effects: [watch] }

    const describe = (entry: RequestEntry) => ({ method: entry.method, url: entry.url, ms: event.now - entry.at })
    return {
      state: { ...state, warnedAt: event.now },
      effects: [
        watch,
        {
          type: "log.stall",
          data: { limit: config.limit, inflight: state.inflight.map(describe), queued: state.waiting.map(describe) },
        },
      ],
    }
  }

  if (event.type === "request.arrived") {
    const entry: RequestEntry = {
      id: state.nextId,
      method: event.method,
      url: event.url,
      at: event.now,
      slow: event.slow,
    }
    const nextId = entry.id + 1
    if (canStart(state.inflight, entry, config))
      return {
        state: { ...state, nextId, inflight: [...state.inflight, entry] },
        effects: [{ type: "request.start", id: entry.id }],
      }
    if (state.status === "queued")
      return { state: { ...state, nextId, waiting: [...state.waiting, entry] }, effects: NO_EFFECTS }
    return {
      state: { ...state, status: "queued", nextId, waiting: [entry] },
      effects: [{ type: "watcher.start", delayMs: config.stallMs }],
    }
  }

  const index = state.inflight.findIndex((entry) => entry.id === event.id)
  if (index === -1) {
    // A queued request can be cancelled, but cannot settle before it is dispatched.
    if (state.status === "running" || event.type === "request.settled") return { state, effects: NO_EFFECTS }
    const pending = state.waiting.findIndex((entry) => entry.id === event.id)
    if (pending === -1) return { state, effects: NO_EFFECTS }
    const waiting = state.waiting.toSpliced(pending, 1)
    return waiting.length
      ? { state: { ...state, waiting }, effects: NO_EFFECTS }
      : { state: running(state, state.inflight), effects: [STOP_WATCHER] }
  }

  const inflight = state.inflight.toSpliced(index, 1)
  if (state.status === "running") return { state: { ...state, inflight }, effects: NO_EFFECTS }
  // FIFO among eligible requests; saturated slow slots do not block fast reads.
  const next = state.waiting.findIndex((entry) => canStart(inflight, entry, config))
  if (next === -1) return { state: { ...state, inflight }, effects: NO_EFFECTS }
  const entry = { ...state.waiting[next]!, at: event.now }
  const waiting = state.waiting.toSpliced(next, 1)
  const active = [...inflight, entry]
  const start: RequestQueueEffect = { type: "request.start", id: entry.id }
  return waiting.length
    ? { state: { ...state, inflight: active, waiting }, effects: [start] }
    : { state: running(state, active), effects: [STOP_WATCHER, start] }
}

function canStart(inflight: readonly RequestEntry[], entry: RequestEntry, config: RequestQueueConfig) {
  if (inflight.length >= config.limit) return false
  return !entry.slow || inflight.reduce((count, item) => count + Number(item.slow), 0) < config.slowLimit
}

function running(state: RequestQueueState, inflight: readonly RequestEntry[]): RequestQueueState {
  return { status: "running", nextId: state.nextId, warnedAt: state.warnedAt, inflight }
}
