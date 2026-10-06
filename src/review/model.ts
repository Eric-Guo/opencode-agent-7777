import type { FileDiffInfo, OpenCodeClient, OpenCodeEvent } from "@opencode/client/promise"
import { createStore } from "solid-js/store"

// The compact review owns one activation's reads. Diff rendering belongs to session-ui.
export function createReviewModel(input: {
  client: { session: Pick<OpenCodeClient["session"], "diff"> }
  sessionID: string
  signal: AbortSignal
}) {
  const [state, setState] = createStore({ diffs: [] as FileDiffInfo[], loading: false, error: undefined as unknown })
  let pending: AbortController | undefined
  let disposed = false

  const refresh = async () => {
    if (disposed || input.signal.aborted) return
    pending?.abort()
    const controller = new AbortController()
    pending = controller
    const signal = AbortSignal.any([input.signal, controller.signal])
    setState({ loading: true, error: undefined })

    try {
      // Bounded patches avoid transferring full files for a read-only turn review.
      const diffs = await input.client.session.diff({ sessionID: input.sessionID, context: 3 }, { signal })
      if (!signal.aborted) setState({ diffs, loading: false })
    } catch (error) {
      if (!signal.aborted) setState({ loading: false, error })
    }
  }

  return {
    state,
    refresh,
    event(event: OpenCodeEvent) {
      if (event.type === "server.connected") return void refresh()
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
      pending?.abort()
    },
  }
}
