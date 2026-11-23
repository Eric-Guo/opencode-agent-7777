import type { FileDiffInfo } from "@opencode/client/promise"
import type { TurnDiffState } from "@opencode/session-ui/context"

// One entry per closing idle marker. Only a failed read can start a second attempt.
export type TurnDiffEntry = TurnDiffState | undefined
type TurnDiffEvent = { type: "load" } | { type: "loaded"; diffs: readonly FileDiffInfo[] } | { type: "failed" }

export const LOADING_TURN_DIFF = Object.freeze({ status: "loading" } as const)

export function transitionTurnDiff(entry: TurnDiffEntry, event: TurnDiffEvent): TurnDiffEntry {
  if (event.type === "load") return !entry || entry.status === "failed" ? LOADING_TURN_DIFF : entry
  if (entry?.status !== "loading") return entry
  return event.type === "loaded" ? { status: "ready", diffs: event.diffs } : { status: "failed" }
}
