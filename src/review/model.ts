import type { FileDiffInfo, OpenCodeClient, OpenCodeEvent } from "@opencode/client/promise"
import { createStore } from "solid-js/store"

export type ChangeMode = "turn" | "working" | "branch"
export type ReviewSource = { mode: ChangeMode; base?: string }

// The compact review owns one activation's reads. Diff rendering belongs to session-ui.
export function createReviewModel(input: {
  client: { session: Pick<OpenCodeClient["session"], "diff">; vcs: Pick<OpenCodeClient["vcs"], "diff"> }
  sessionID: string
  directory: string
  signal: AbortSignal
}) {
  const [state, setState] = createStore({
    source: { mode: "turn" } as ReviewSource,
    diffs: [] as FileDiffInfo[],
    loading: false,
    error: undefined as unknown,
  })
  let pending: AbortController | undefined
  let scheduled: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const alive = () => !disposed && !input.signal.aborted
  const clearScheduled = () => {
    clearTimeout(scheduled)
    scheduled = undefined
  }

  const refresh = async () => {
    if (!alive()) return
    clearScheduled()
    pending?.abort()
    const controller = new AbortController()
    pending = controller
    const signal = AbortSignal.any([input.signal, controller.signal])
    const source = { ...state.source }
    setState({ loading: true, error: undefined })

    try {
      // Both sources use public APIs and bounded patches; neither reads files from the renderer checkout.
      const diffs =
        source.mode === "turn"
          ? await input.client.session.diff({ sessionID: input.sessionID, context: 3 }, { signal })
          : (
              await input.client.vcs.diff(
                { location: { directory: input.directory }, mode: source.mode, base: source.base, context: 3 },
                { signal },
              )
            ).data
      if (!signal.aborted) setState({ diffs, loading: false })
    } catch (error) {
      if (!signal.aborted) setState({ loading: false, error })
    }
  }

  input.signal.addEventListener("abort", clearScheduled, { once: true })

  return {
    state,
    refresh,
    select(source: ReviewSource) {
      if (!alive()) return
      const base = source.mode === "branch" ? source.base?.trim() || undefined : undefined
      if (source.mode === state.source.mode && base === state.source.base) return
      // Replace the source and its result together so an old diff never appears under a new label.
      setState({ source: { mode: source.mode, base }, diffs: [], error: undefined })
      return refresh()
    },
    event(event: OpenCodeEvent) {
      if (!alive()) return
      if (event.type === "server.connected") return void refresh()
      if (event.type === "filesystem.changed") {
        if (state.source.mode === "turn" || event.location?.directory !== input.directory) return
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
    dispose() {
      disposed = true
      clearScheduled()
      input.signal.removeEventListener("abort", clearScheduled)
      pending?.abort()
    },
  }
}

export type ReviewModel = ReturnType<typeof createReviewModel>
