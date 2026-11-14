import type { SessionRevert } from "@opencode/client/promise"
import type { PromptDraft } from "@/composer/state"
import type { ComposerPrompt } from "@/composer/types"

export const REVERT_TIMEOUT_MS = 30_000

export type RevertOperation = {
  readonly messageID?: string
  readonly draft?: PromptDraft
  readonly originalParts: ComposerPrompt
  readonly originalDraft: string
}

export type SessionRevertState =
  | { readonly status: "idle"; readonly attempt: number }
  | {
      readonly status: "running"
      readonly phase: "mutating" | "refreshing"
      readonly attempt: number
      readonly operation: RevertOperation
    }
  | { readonly status: "disposed" }

export type SessionRevertEvent =
  | { readonly type: "requested"; readonly operation: RevertOperation }
  | { readonly type: "succeeded"; readonly attempt: number; readonly result: SessionRevert | void }
  | { readonly type: "refreshed" | "timed-out"; readonly attempt: number }
  | { readonly type: "failed"; readonly attempt: number; readonly error: unknown }
  | { readonly type: "reset" }
  | { readonly type: "disposed" }

export type SessionRevertEffect =
  | { readonly type: "apply"; readonly operation: RevertOperation; readonly result: SessionRevert | void }
  | { readonly type: "failed"; readonly error: unknown }
  | { readonly type: "timed-out" }
  | { readonly type: "reconcile" }

export function createSessionRevertState(): SessionRevertState {
  return { status: "idle", attempt: 0 }
}

export function transitionSessionRevert(
  state: SessionRevertState,
  event: SessionRevertEvent,
): { state: SessionRevertState; effects: SessionRevertEffect[] } {
  const unchanged = { state, effects: [] }
  if (state.status === "disposed") return unchanged
  if (event.type === "disposed") return { state: { status: "disposed" }, effects: [] }
  if (event.type === "reset")
    return state.status === "idle" ? unchanged : { state: { status: "idle", attempt: state.attempt }, effects: [] }
  if (event.type === "requested")
    return state.status === "running"
      ? unchanged
      : {
          state: { status: "running", phase: "mutating", attempt: state.attempt + 1, operation: event.operation },
          effects: [],
        }
  if (state.status !== "running" || state.attempt !== event.attempt) return unchanged
  if (event.type === "succeeded")
    return state.phase !== "mutating"
      ? unchanged
      : {
          state: { ...state, phase: "refreshing" },
          effects: [{ type: "apply", operation: state.operation, result: event.result }],
        }
  if (event.type === "refreshed" && state.phase !== "refreshing") return unchanged
  return {
    state: { status: "idle", attempt: state.attempt },
    effects:
      event.type === "timed-out"
        ? [{ type: "timed-out" }, ...(state.phase === "mutating" ? [{ type: "reconcile" } as const] : [])]
        : event.type === "failed"
          ? [
              { type: "failed", error: event.error },
              ...(state.phase === "mutating" ? [{ type: "reconcile" } as const] : []),
            ]
          : [],
  }
}

export const selectSessionRevertBusy = (state: SessionRevertState) => state.status === "running"
