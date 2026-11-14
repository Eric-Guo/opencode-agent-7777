import type { PromptDraft } from "@/composer/state"

export type QueueOperation = {
  readonly id: string
  readonly action: "steer" | "remove" | "undo"
  readonly restored?: PromptDraft
}

export type QueueState =
  | { readonly status: "idle"; readonly attempt: number }
  | { readonly status: "running"; readonly attempt: number; readonly operation: QueueOperation }
  | { readonly status: "disposed" }

export type QueueEvent =
  | { readonly type: "requested"; readonly operation: QueueOperation }
  | { readonly type: "succeeded" | "cancelled" | "delivered"; readonly attempt: number }
  | { readonly type: "failed"; readonly attempt: number; readonly error: unknown }
  | { readonly type: "reset" }
  | { readonly type: "disposed" }

export type QueueEffect =
  | { readonly type: "apply"; readonly operation: QueueOperation }
  | { readonly type: "failed"; readonly error: unknown }
  | { readonly type: "refresh" }

export function createQueueState(): QueueState {
  return { status: "idle", attempt: 0 }
}

export function transitionQueue(state: QueueState, event: QueueEvent): { state: QueueState; effects: QueueEffect[] } {
  const unchanged = { state, effects: [] }
  if (state.status === "disposed") return unchanged
  if (event.type === "disposed") return { state: { status: "disposed" }, effects: [] }
  if (event.type === "reset")
    return state.status === "idle" ? unchanged : { state: { status: "idle", attempt: state.attempt }, effects: [] }
  if (event.type === "requested")
    return state.status === "running"
      ? unchanged
      : { state: { status: "running", attempt: state.attempt + 1, operation: event.operation }, effects: [] }
  if (state.status !== "running" || state.attempt !== event.attempt) return unchanged
  if (event.type === "cancelled" && state.operation.action === "steer") return unchanged
  return {
    state: { status: "idle", attempt: state.attempt },
    effects:
      event.type === "failed"
        ? [{ type: "failed", error: event.error }, { type: "refresh" }]
        : event.type === "delivered"
          ? [{ type: "refresh" }]
          : [{ type: "apply", operation: state.operation }, { type: "refresh" }],
  }
}

export const selectQueueBusy = (state: QueueState) => state.status === "running"
export const selectQueueUndoing = (state: QueueState) => state.status === "running" && state.operation.action === "undo"
