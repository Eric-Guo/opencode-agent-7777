import {
  createRequestQueueState,
  isRequestInflight,
  selectInflightCount,
  selectQueuedCount,
  transitionRequestQueue,
  type RequestQueueEffect,
  type RequestQueueEvent,
} from "./request-queue-machine"

// Chromium allows six connections per origin. The event stream holds one for the life of the
// connection and health probes use their own fetch, so the app's API calls stay below that or
// a burst stalls probes and user actions inside the browser where nothing can observe it.
export const requestQueueLimit = 4

// Endpoints that shell out to git or walk the filesystem take seconds on a large repository. They
// may hold at most this many slots, so a session mount's small reads never queue behind them.
export const requestQueueSlowLimit = 2
export const slowRequestPaths = ["/api/vcs", "/api/worktree"]

// A mount legitimately fires a dozen requests at once; only a request that has waited this long
// for a slot indicates the server is not keeping up.
export const requestStallMs = 2_000

// A socket that dies while the device sleeps can leave fetch waiting for response headers until the
// OS gives up on TCP retransmits, which takes minutes. Bound that so a dead request frees its slot
// instead of wedging every later API call; the body may still stream for as long as it needs.
export const requestHeadersTimeoutMs = 60_000

// Creating a worktree runs the project's setup script (dependency installs, fetches) before the
// server answers, so it needs a budget measured in minutes rather than seconds. Cutting it off
// kills the script midway and leaves a registered but half-initialised worktree behind.
export const setupRequestHeadersTimeoutMs = 10 * 60_000

export function isSlowRequest(pathname: string) {
  return slowRequestPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function isSetupRequest(method: string, pathname: string) {
  return method === "POST" && pathname === "/api/worktree"
}

export function createRequestQueue(input: {
  fetch: typeof globalThis.fetch
  limit?: number
  slowLimit?: number
  stallMs?: number
  headersTimeoutMs?: number
  setupHeadersTimeoutMs?: number
  log?: (message: string, data: Record<string, unknown>) => void
  now?: () => number
}) {
  const config = {
    limit: input.limit ?? requestQueueLimit,
    slowLimit: input.slowLimit ?? requestQueueSlowLimit,
    stallMs: input.stallMs ?? requestStallMs,
  }
  const headersTimeoutMs = input.headersTimeoutMs ?? requestHeadersTimeoutMs
  const setupHeadersTimeoutMs = input.setupHeadersTimeoutMs ?? setupRequestHeadersTimeoutMs
  // Call the browser fetch unbound; `input.fetch(...)` would make `this` the options object.
  const base = input.fetch
  const now = input.now ?? Date.now
  const log = input.log ?? ((message, data) => console.warn(`[server-request-queue] ${message}`, data))
  let queue = createRequestQueueState()
  // Only promise callbacks live here; the machine owns admission and waiting order.
  const waiters = new Map<number, () => void>()
  let watcher: ReturnType<typeof setTimeout> | undefined

  const run = (effect: RequestQueueEffect) => {
    if (effect.type === "request.start") return waiters.get(effect.id)?.()
    if (effect.type === "log.stall") return log("server thrashing detected", effect.data)
    clearTimeout(watcher)
    watcher =
      effect.type === "watcher.start"
        ? setTimeout(() => dispatch({ type: "watch.due", now: now() }), effect.delayMs)
        : undefined
  }

  const dispatch = (event: RequestQueueEvent) => {
    const result = transitionRequestQueue(queue, event, config)
    queue = result.state
    result.effects.forEach(run)
  }

  const waitForSlot = (id: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const leave = () => {
        signal.removeEventListener("abort", abort)
        waiters.delete(id)
      }
      const abort = () => {
        leave()
        dispatch({ type: "request.aborted", id, now: now() })
        reject(abortReason(signal))
      }
      waiters.set(id, () => {
        leave()
        resolve()
      })
      signal.addEventListener("abort", abort, { once: true })
      if (signal.aborted) abort()
    })

  const fetch: typeof globalThis.fetch = Object.assign(
    async (resource: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(resource, init)
      const pathname = new URL(request.url).pathname
      if (request.signal.aborted) throw abortReason(request.signal)
      // The event stream is long-lived; never count it against the request budget.
      if (pathname === "/api/event") return base(request)
      const id = queue.nextId
      dispatch({
        type: "request.arrived",
        method: request.method,
        url: request.url,
        slow: isSlowRequest(pathname),
        now: now(),
      })
      // Keep free-slot dispatch synchronous; await only when the machine withheld a slot.
      if (!isRequestInflight(queue, id)) await waitForSlot(id, request.signal)
      if (request.signal.aborted) {
        dispatch({ type: "request.aborted", id, now: now() })
        throw abortReason(request.signal)
      }
      const controller = new AbortController()
      // The header deadline ends when fetch resolves; caller cancellation still owns the response body.
      const signal = AbortSignal.any([request.signal, controller.signal])
      const timer = setTimeout(
        () => controller.abort(new DOMException("Timed out waiting for the server to respond", "TimeoutError")),
        isSetupRequest(request.method, pathname) ? setupHeadersTimeoutMs : headersTimeoutMs,
      )
      try {
        return await base(new Request(request, { signal }))
      } finally {
        clearTimeout(timer)
        dispatch({ type: "request.settled", id, now: now() })
      }
    },
    // Bun's fetch type carries preconnect; the browser never calls it.
    { preconnect: () => {} },
  )

  return {
    fetch,
    inflight: () => selectInflightCount(queue),
    queued: () => selectQueuedCount(queue),
  }
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError")
}
