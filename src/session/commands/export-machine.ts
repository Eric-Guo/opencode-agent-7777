import type { OpenCodeClient } from "@opencode/client/promise"
import type { SessionExportData } from "./export"

export const EXPORT_TIMEOUT_MS = 60_000

export type SessionExportTarget = { readonly sessionID: string; readonly api: OpenCodeClient }
export type SessionExportState =
  | { readonly status: "idle"; readonly attempt: number }
  | { readonly status: "fetching" | "saving"; readonly attempt: number; readonly target: SessionExportTarget }
  | { readonly status: "disposed" }

export type SessionExportEvent =
  | { readonly type: "requested"; readonly target: SessionExportTarget }
  | { readonly type: "fetched"; readonly attempt: number; readonly data: SessionExportData }
  | { readonly type: "saved"; readonly attempt: number; readonly filename: string }
  | { readonly type: "failed"; readonly attempt: number; readonly error: unknown }
  | { readonly type: "timed-out"; readonly attempt: number }
  | { readonly type: "disposed" }

export type SessionExportEffect =
  | { readonly type: "save"; readonly data: SessionExportData; readonly attempt: number }
  | { readonly type: "saved"; readonly filename: string }
  | { readonly type: "failed"; readonly error: unknown }
  | { readonly type: "timed-out" }

export function createSessionExportState(): SessionExportState {
  return { status: "idle", attempt: 0 }
}

export function transitionSessionExport(
  state: SessionExportState,
  event: SessionExportEvent,
): { state: SessionExportState; effects: SessionExportEffect[] } {
  const unchanged = { state, effects: [] }
  if (state.status === "disposed") return unchanged
  if (event.type === "disposed") return { state: { status: "disposed" }, effects: [] }
  if (event.type === "requested")
    return state.status !== "idle"
      ? unchanged
      : { state: { status: "fetching", attempt: state.attempt + 1, target: event.target }, effects: [] }
  if (state.status === "idle" || event.attempt !== state.attempt) return unchanged
  if (event.type === "fetched")
    return state.status !== "fetching"
      ? unchanged
      : {
          state: { ...state, status: "saving" },
          effects: [{ type: "save", data: event.data, attempt: event.attempt }],
        }
  if (event.type === "saved" && state.status !== "saving") return unchanged
  return {
    state: { status: "idle", attempt: state.attempt },
    effects: [
      event.type === "saved"
        ? { type: "saved", filename: event.filename }
        : event.type === "failed"
          ? { type: "failed", error: event.error }
          : { type: "timed-out" },
    ],
  }
}

export const selectSessionExporting = (state: SessionExportState) =>
  state.status === "fetching" || state.status === "saving"
