import type { OpenCodeClient, OpenCodeEvent } from "@opencode/client/promise"
import { abort } from "@opencode/util/abort"
import { createSignal, untrack } from "solid-js"
import {
  createReviewState,
  REVIEW_DIFF_TIMEOUT_MS,
  transitionReview,
  type ReviewEvent,
  type ReviewSource,
} from "./machine"

export type { ChangeMode, ReviewSource } from "./machine"

// The compact review owns one activation's reads. Diff rendering belongs to session-ui.
export function createReviewModel(input: {
  client: { session: Pick<OpenCodeClient["session"], "diff">; vcs: Pick<OpenCodeClient["vcs"], "diff"> }
  sessionID: string
  directory: string
  signal: AbortSignal
}) {
  const [state, setState] = createSignal(createReviewState())
  let finishRead: ((cancel: boolean) => void) | undefined
  let scheduled: ReturnType<typeof setTimeout> | undefined
  const clearScheduled = () => {
    clearTimeout(scheduled)
    scheduled = undefined
  }

  async function read(source: ReviewSource, signal: AbortSignal) {
    if (source.mode === "turn") return input.client.session.diff({ sessionID: input.sessionID, context: 3 }, { signal })
    const result = await input.client.vcs.diff(
      { location: { directory: input.directory }, mode: source.mode, base: source.base, context: 3 },
      { signal },
    )
    return result.data
  }

  function dispatch(event: ReviewEvent): Promise<void> | undefined {
    const previous = untrack(state)
    const next = transitionReview(previous, event)
    if (next === previous) return
    finishRead?.(event.type !== "loaded" && event.type !== "failed")
    finishRead = undefined
    if (next.status !== "loading") {
      setState(next)
      return
    }

    clearScheduled()
    const { attempt, source } = next
    const controller = new AbortController()
    const done = Promise.withResolvers<void>()
    const timer = setTimeout(() => dispatch({ type: "timed-out", attempt }), REVIEW_DIFF_TIMEOUT_MS)
    // A transport may ignore abort. Settle callers as soon as this attempt ends.
    finishRead = (cancel) => {
      clearTimeout(timer)
      if (cancel) abort(controller)
      done.resolve()
    }
    setState(next)
    if (!controller.signal.aborted)
      void read(source, controller.signal).then(
        (diffs) => dispatch({ type: "loaded", attempt, diffs }),
        (error: unknown) => dispatch({ type: "failed", attempt, error }),
      )
    return done.promise
  }

  const refresh = () => dispatch({ type: "refresh" }) ?? Promise.resolve()
  function dispose() {
    input.signal.removeEventListener("abort", dispose)
    clearScheduled()
    dispatch({ type: "dispose" })
  }
  if (input.signal.aborted) dispose()
  else input.signal.addEventListener("abort", dispose, { once: true })

  return {
    get state() {
      return state()
    },
    refresh,
    select: (source: ReviewSource) => dispatch({ type: "select", source }),
    event(event: OpenCodeEvent) {
      if (untrack(state).status === "disposed") return
      if (event.type === "server.connected") return void refresh()
      if (event.type === "filesystem.changed") {
        if (untrack(state).source.mode === "turn" || event.location?.directory !== input.directory) return
        // Match the extension's coalescing of workspace watcher bursts, using the existing stream.
        clearScheduled()
        scheduled = setTimeout(() => void refresh(), 100)
        return
      }
      if (
        event.type !== "session.execution.succeeded" &&
        event.type !== "session.execution.failed" &&
        event.type !== "session.execution.interrupted" &&
        event.type !== "session.revert.staged" &&
        event.type !== "session.revert.cleared" &&
        event.type !== "session.revert.committed"
      )
        return

      if (event.data.sessionID === input.sessionID) void refresh()
    },
    dispose,
  }
}

export type ReviewModel = ReturnType<typeof createReviewModel>
