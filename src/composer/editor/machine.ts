// Only the first empty echo of local input may retain the browser's blank lines.
// Frozen states and transitions stay outside Solid stores and allocate nothing per keystroke.
export type EditorSyncState = { readonly status: "synced" } | { readonly status: "local-blank" }

export type EditorSyncEvent =
  | { readonly type: "input.parsed"; readonly blank: boolean }
  | { readonly type: "store.changed"; readonly matches: boolean; readonly blank: boolean }

const SYNCED: EditorSyncState = Object.freeze({ status: "synced" })
const LOCAL_BLANK: EditorSyncState = Object.freeze({ status: "local-blank" })
export const INITIAL_EDITOR_SYNC_STATE: EditorSyncState = SYNCED
export const INPUT_PARSED = Object.freeze({ type: "input.parsed", blank: false }) satisfies EditorSyncEvent
export const INPUT_PARSED_BLANK = Object.freeze({ type: "input.parsed", blank: true }) satisfies EditorSyncEvent

const MATCHES = Object.freeze({ type: "store.changed", matches: true, blank: false }) satisfies EditorSyncEvent
const BLANK = Object.freeze({ type: "store.changed", matches: false, blank: true }) satisfies EditorSyncEvent
const DIFFERS = Object.freeze({ type: "store.changed", matches: false, blank: false }) satisfies EditorSyncEvent
const STAY_SYNCED = Object.freeze({ state: SYNCED, render: false })
const STAY_LOCAL_BLANK = Object.freeze({ state: LOCAL_BLANK, render: false })
const RENDER = Object.freeze({ state: SYNCED, render: true })

export function storeChanged(matches: boolean, blank: boolean): EditorSyncEvent {
  return matches ? MATCHES : blank ? BLANK : DIFFERS
}

export function transitionEditorSync(state: EditorSyncState, event: EditorSyncEvent) {
  if (event.type === "input.parsed") return event.blank ? STAY_LOCAL_BLANK : STAY_SYNCED
  if (event.matches || (state.status === "local-blank" && event.blank)) return STAY_SYNCED
  return RENDER
}
