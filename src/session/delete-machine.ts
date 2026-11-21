import { isSessionNotFoundError } from "@/runtime/server/errors"
import { createLoadState, transitionLoad, type LoadEvent, type LoadState } from "@/runtime/server/load-machine"

export type SessionDeleteState = LoadState & { readonly sessionID: string }

export function createSessionDeleteState(sessionID: string): SessionDeleteState {
  return { ...createLoadState(), sessionID }
}

export function transitionSessionDelete(state: SessionDeleteState, event: LoadEvent): SessionDeleteState {
  // A new confirmation can start a delete or retry a failure. A pending or completed delete cannot be resubmitted.
  if (event.type === "started" && state.status !== "idle" && state.status !== "failed") return state

  // A delete acknowledged as already gone succeeds only for its own session and pending attempt.
  const next =
    event.type === "failed" && isSessionNotFoundError(event.error, state.sessionID)
      ? transitionLoad(state, { type: "succeeded", attempt: event.attempt })
      : transitionLoad(state, event)
  return next === state ? state : { ...next, sessionID: state.sessionID }
}
