import type { FileDiffInfo, OpenCodeEvent, VcsDiffInput } from "@opencode/client/promise"
import { sameDirectory } from "@opencode/util/path"

export const REVIEW_DIFF_TIMEOUT_MS = 30_000
export type ChangeMode = "turn" | VcsDiffInput["mode"]
export type ReviewSource = { mode: ChangeMode; base?: string }
export type ReviewScope = { sessionID: string; directory: string }

type ReviewState = {
  status: "idle" | "loading" | "ready" | "error" | "timed-out" | "disposed"
  source: ReviewSource
  diffs: FileDiffInfo[]
  attempt: number
  error?: unknown
}

export type ReviewEvent =
  | { type: "select"; source: ReviewSource }
  | { type: "refresh" | "dispose" }
  | { type: "loaded"; attempt: number; diffs: FileDiffInfo[] }
  | { type: "failed"; attempt: number; error: unknown }
  | { type: "timed-out"; attempt: number }

export function createReviewState(): ReviewState {
  return { status: "idle", source: { mode: "turn" }, diffs: [], attempt: 0 }
}

export function reviewRefreshForEvent(
  state: ReviewState,
  scope: ReviewScope,
  event: OpenCodeEvent,
): "refresh" | "debounce" | undefined {
  if (state.status === "disposed") return
  switch (event.type) {
    case "server.connected":
      return "refresh"
    case "filesystem.changed": {
      const directory = event.location?.directory
      if (state.source.mode !== "turn" && directory !== undefined && sameDirectory(directory, scope.directory))
        return "debounce"
      return
    }
    case "session.execution.succeeded":
    case "session.execution.failed":
    case "session.execution.interrupted":
    case "session.revert.staged":
    case "session.revert.cleared":
    case "session.revert.committed":
      if (event.data.sessionID === scope.sessionID) return "refresh"
  }
}

export function transitionReview(state: ReviewState, event: ReviewEvent): ReviewState {
  if (state.status === "disposed") return state
  switch (event.type) {
    case "dispose":
      return { ...state, status: "disposed" }
    case "select": {
      const { mode } = event.source
      const base = mode === "branch" || mode === "committed" ? event.source.base?.trim() || undefined : undefined
      if (mode === state.source.mode && base === state.source.base) return state
      // Publish the new label and clear its predecessor's rows together.
      return { status: "loading", source: { mode, base }, diffs: [], attempt: state.attempt + 1 }
    }
    case "refresh":
      return { ...state, status: "loading", error: undefined, attempt: state.attempt + 1 }
  }
  if (state.status !== "loading" || event.attempt !== state.attempt) return state
  if (event.type === "loaded") return { ...state, status: "ready", diffs: event.diffs }
  if (event.type === "failed") return { ...state, status: "error", error: event.error }
  return { ...state, status: "timed-out" }
}
