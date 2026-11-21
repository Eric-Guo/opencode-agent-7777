import type { OpenCodeClient, OpenCodeEvent } from "@opencode/client/promise"
import { defaultIdleTimeout } from "@opencode/client/solid"
import { abort } from "@opencode/util/abort"
import { clearReadError, reportReadError } from "../read-errors"
import { initialStreamState, transitionStream } from "./machine"

export function startSessionConnection(input: {
  client: OpenCodeClient
  signal: AbortSignal
  connected: (value: boolean) => void
  greeting: () => void
  event: (event: OpenCodeEvent) => void
  retry: () => void
}) {
  let state = initialStreamState()
  let request: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  function dispatch(event: Parameters<typeof transitionStream>[1]) {
    const previous = state
    state = transitionStream(previous, event)
    if (state === previous) return false
    if (state.status === "live" && previous.status !== "live") clearReadError(stop)
    input.connected(state.status === "live")
    return true
  }
  function stop() {
    input.signal.removeEventListener("abort", stop)
    clearTimeout(timer)
    abort(request)
    clearReadError(stop)
    dispatch("dispose")
  }
  async function connect() {
    const controller = new AbortController()
    request = controller
    const watch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => abort(controller), defaultIdleTimeout)
    }
    watch()
    try {
      const events = input.client.event.subscribe({
        signal: controller.signal,
        onActivity: () => {
          if (controller.signal.aborted) return
          watch()
          dispatch("activity")
        },
      })
      for await (const event of events) {
        if (controller.signal.aborted) break
        if (event.type === "server.connected" && dispatch("greeting")) input.greeting()
        input.event(event)
      }
    } catch (error) {
      if (!controller.signal.aborted) reportReadError(stop, error, input.retry)
    } finally {
      abort(controller)
      if (dispatch("ended") && state.status === "waiting") {
        clearTimeout(timer)
        timer = setTimeout(() => {
          if (dispatch("retry")) void connect()
        }, state.delay)
      }
    }
  }

  input.signal.addEventListener("abort", stop, { once: true })
  if (input.signal.aborted) stop()
  else void connect()
}
