export const ATTACHMENT_TIMEOUT_MS = 60_000
export const ATTACHMENT_TIMED_OUT = Object.freeze({ reason: "attachment-timed-out" })

export type AttachmentOwner = { readonly scope: unknown; readonly identity: unknown }
type Entry = { readonly attempt: number; readonly phase: "choosing" | "preparing"; readonly revision: number }
type Base = { readonly owner: AttachmentOwner; readonly issued: number }
export type PreparationState = Base &
  ({ readonly status: "idle" | "disposed" } | { readonly status: "active"; readonly entries: readonly Entry[] })
export type PreparationEvent =
  | { type: "owner.changed"; owner: AttachmentOwner }
  | { type: "started"; phase: Entry["phase"] }
  | { type: "selected"; attempt: number }
  | { type: "progress"; attempt: number }
  | { type: "succeeded"; attempt: number; added: boolean }
  | { type: "failed"; attempt: number; error: unknown }
  | { type: "timed-out"; attempt: number; revision: number }
  | { type: "cancelled"; attempt: number }
  | { type: "cancel-all" }
  | { type: "disposed" }
export type PreparationEffect =
  | { type: "timer"; attempt: number; revision: number }
  | { type: "succeeded"; attempt: number; added: boolean }
  | { type: "failed"; attempt: number; error: unknown }
  | { type: "cancelled"; attempt: number }

const NONE: readonly PreparationEffect[] = Object.freeze([])
const EMPTY: readonly Entry[] = Object.freeze([])
export const sameAttachmentOwner = (left: AttachmentOwner, right: AttachmentOwner) =>
  left.scope === right.scope && left.identity === right.identity
export const preparationEntries = (state: PreparationState) => (state.status === "active" ? state.entries : EMPTY)
export const isPreparingAttachments = (state: PreparationState) =>
  preparationEntries(state).some((entry) => entry.phase === "preparing")
export const createPreparationState = (owner: AttachmentOwner): PreparationState => ({
  status: "idle",
  issued: 0,
  owner,
})

export function transitionPreparation(
  state: PreparationState,
  event: PreparationEvent,
): { state: PreparationState; effects: readonly PreparationEffect[] } {
  const stay = () => ({ state, effects: NONE })
  if (state.status === "disposed") return stay()
  const entries = preparationEntries(state)
  if (event.type === "cancel-all" && entries.length === 0) return stay()
  if (event.type === "owner.changed" && sameAttachmentOwner(state.owner, event.owner)) return stay()
  if (event.type === "owner.changed" || event.type === "cancel-all" || event.type === "disposed") {
    return {
      state: {
        status: event.type === "disposed" ? "disposed" : "idle",
        owner: event.type === "owner.changed" ? event.owner : state.owner,
        issued: state.issued,
      },
      effects: entries.map(({ attempt }) => ({ type: "cancelled", attempt })),
    }
  }
  if (event.type === "started") {
    const attempt = state.issued + 1
    const entry: Entry = { attempt, phase: event.phase, revision: 0 }
    return {
      state: { ...state, status: "active", issued: attempt, entries: [...entries, entry] },
      effects: event.phase === "preparing" ? [{ type: "timer", attempt, revision: 0 }] : NONE,
    }
  }
  const entry = entries.find((item) => item.attempt === event.attempt)
  if (!entry) return stay()
  if (event.type === "selected" || event.type === "progress") {
    if (event.type === "selected" && entry.phase === "preparing") return stay()
    if (event.type === "progress" && entry.phase !== "preparing") return stay()
    const revision = entry.revision + 1
    return {
      state: {
        ...state,
        status: "active",
        entries: entries.map((item) => (item === entry ? { ...entry, phase: "preparing", revision } : item)),
      },
      effects: [{ type: "timer", attempt: entry.attempt, revision }],
    }
  }
  if (event.type === "timed-out" && (entry.phase !== "preparing" || event.revision !== entry.revision)) return stay()
  const rest = entries.filter((item) => item !== entry)
  return {
    state: rest.length
      ? { ...state, status: "active", entries: rest }
      : { status: "idle", owner: state.owner, issued: state.issued },
    effects: [
      event.type === "timed-out" ? { type: "failed", attempt: entry.attempt, error: ATTACHMENT_TIMED_OUT } : event,
    ],
  }
}
