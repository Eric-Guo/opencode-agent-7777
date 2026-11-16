import type { ComposerCapabilities, ComposerHistoryEntry, ComposerPersistedState, ComposerSuggestion } from "../types"
import { isAttachment, promptText } from "../prompt-parts"

export type ComposerMode = "normal" | "shell"

export type ComposerHistoryState =
  | { readonly type: "idle" }
  | { readonly type: "browsing"; readonly index: number; readonly saved: ComposerHistoryEntry }

const IDLE_HISTORY: ComposerHistoryState = Object.freeze({ type: "idle" })

export type ComposerInteractionState = {
  readonly popover:
    | { readonly type: "closed" }
    | { readonly type: "context"; readonly query: string }
    | { readonly type: "command-inline"; readonly query: string }
    | { readonly type: "command-menu"; readonly query: string }
  readonly drag: "idle" | "active"
  readonly focus: "editor" | "command-search" | "external"
  readonly activeContextID?: string
  readonly history: ComposerHistoryState
}

export type ComposerInteractionEvent =
  | { readonly type: "input.changed"; readonly value: string; readonly persist?: boolean }
  | {
      readonly type: "history.step"
      readonly direction: "up" | "down"
      readonly text: string
      readonly cursor: number
      readonly entries: readonly ComposerHistoryEntry[]
      readonly saved: ComposerHistoryEntry
    }
  | { readonly type: "history.reset" }
  | { readonly type: "owner.changed" }
  | { readonly type: "mode.synced"; readonly mode: ComposerMode }
  | { readonly type: "commands.open" }
  | { readonly type: "context.open" }
  | { readonly type: "popover.query"; readonly value: string }
  | { readonly type: "popover.close" }
  | { readonly type: "popover.select"; readonly item: ComposerSuggestion }
  | { readonly type: "key.down"; readonly key: string; readonly ctrl: boolean; readonly empty?: boolean }
  | { readonly type: "mode.shell" }
  | { readonly type: "mode.normal" }
  | { readonly type: "drag.enter" }
  | { readonly type: "drag.leave" }
  | { readonly type: "focus.editor" }
  | { readonly type: "focus.external" }
  | { readonly type: "context.active"; readonly id: string }

export type ComposerInteractionCommand =
  | { readonly type: "draft.setMode"; readonly mode: ComposerMode }
  | { readonly type: "history.apply"; readonly entry: ComposerHistoryEntry; readonly position: "start" | "end" }
  | { readonly type: "draft.setText"; readonly value: string }
  | { readonly type: "draft.addText"; readonly value: string }
  | { readonly type: "draft.prependText"; readonly value: string }
  | {
      readonly type: "mention.add"
      readonly item: ComposerSuggestion
      readonly range?: { readonly start: number; readonly end: number }
    }
  | { readonly type: "popover.filter"; readonly popover: "command" | "context"; readonly query: string }
  | { readonly type: "focus.editor" }
  | { readonly type: "focus.command-search" }

export type ComposerEditorTransition = {
  readonly state: ComposerInteractionState
  readonly commands: readonly ComposerInteractionCommand[]
  readonly handled: boolean
}

export function createComposerInteractionState(): ComposerInteractionState {
  return {
    popover: { type: "closed" },
    drag: "idle",
    focus: "external",
    history: IDLE_HISTORY,
  }
}

export function selectComposerMode(persisted: Pick<ComposerPersistedState, "mode">): ComposerMode {
  return persisted.mode ?? "normal"
}

export function transitionComposer(
  state: ComposerInteractionState,
  event: ComposerInteractionEvent,
  persisted: ComposerPersistedState,
  capabilities: ComposerCapabilities = {},
): ComposerEditorTransition {
  if (event.type === "input.changed") {
    return inputChanged(state, event.value, event.persist !== false, persisted, capabilities)
  }
  if (event.type === "history.step") return stepHistory(state, event)
  if (event.type === "history.reset")
    return state.history.type === "idle" ? unchanged(state) : changed({ ...state, history: IDLE_HISTORY })
  if (event.type === "owner.changed") return changed(createComposerInteractionState())
  if (event.type === "mode.synced") {
    const popover = event.mode === "shell" ? { type: "closed" as const } : state.popover
    if (state.history.type === "idle" && (popover === state.popover || state.popover.type === "closed"))
      return unchanged(state)
    return changed({ ...state, history: IDLE_HISTORY, popover })
  }
  if (event.type === "commands.open")
    return capabilities.commands === false ? unchanged(state) : openCommands(state, persisted)
  if (event.type === "context.open") return capabilities.context === false ? unchanged(state) : openContext(state)
  if (event.type === "popover.query") return queryChanged(state, event.value)
  if (event.type === "popover.close")
    return state.popover.type === "closed" ? unchanged(state) : changed({ ...state, popover: { type: "closed" } })
  if (event.type === "popover.select") return suggestionSelected(state, event.item, persisted)
  if (event.type === "key.down") return keyDown(state, event, selectComposerMode(persisted))
  if (event.type === "mode.shell") {
    return capabilities.shell === false
      ? unchanged(state)
      : selectComposerMode(persisted) === "shell"
        ? unchanged(state)
        : changed({ ...state, history: IDLE_HISTORY, popover: { type: "closed" } }, [
            { type: "draft.setMode", mode: "shell" },
          ])
  }
  if (event.type === "mode.normal")
    return selectComposerMode(persisted) === "normal"
      ? unchanged(state)
      : changed({ ...state, history: IDLE_HISTORY }, [{ type: "draft.setMode", mode: "normal" }])
  if (event.type === "drag.enter")
    return state.drag === "active" ? unchanged(state) : changed({ ...state, drag: "active" })
  if (event.type === "drag.leave") return state.drag === "idle" ? unchanged(state) : changed({ ...state, drag: "idle" })
  if (event.type === "focus.editor")
    return state.focus === "editor" ? unchanged(state) : changed({ ...state, focus: "editor" })
  if (event.type === "context.active") {
    return changed({ ...state, activeContextID: state.activeContextID === event.id ? undefined : event.id })
  }
  return state.focus === "external" ? unchanged(state) : changed({ ...state, focus: "external" })
}

function inputChanged(
  state: ComposerInteractionState,
  value: string,
  persist: boolean,
  persisted: ComposerPersistedState,
  capabilities: ComposerCapabilities,
): ComposerEditorTransition {
  const setText: ComposerInteractionCommand[] = persist ? [{ type: "draft.setText", value }] : []
  if (capabilities.shell !== false && selectComposerMode(persisted) === "normal" && value === "!") {
    return changed({ ...state, history: IDLE_HISTORY, popover: { type: "closed" }, focus: "editor" }, [
      { type: "draft.setMode", mode: "shell" },
      { type: "draft.setText", value: "" },
    ])
  }
  const context = value.slice(0, persisted.cursor ?? value.length).match(/(?:^|\s)@([^\s@]*)$/)
  if (capabilities.context !== false && context) {
    const query = context[1] ?? ""
    return changed({ ...state, popover: { type: "context", query }, focus: "editor" }, [
      ...setText,
      { type: "popover.filter", popover: "context", query },
    ])
  }

  const command = value.match(/^\/(\S*)$/)
  if (capabilities.commands !== false && command) {
    const query = command[1] ?? ""
    return changed({ ...state, popover: { type: "command-inline", query }, focus: "editor" }, [
      ...setText,
      { type: "popover.filter", popover: "command", query },
    ])
  }

  return changed(
    { ...state, popover: state.popover.type === "command-menu" ? state.popover : { type: "closed" }, focus: "editor" },
    setText,
  )
}

function openCommands(state: ComposerInteractionState, persisted: ComposerPersistedState): ComposerEditorTransition {
  if (!populated(persisted)) {
    return changed({ ...state, popover: { type: "command-inline", query: "" }, focus: "editor" }, [
      { type: "draft.addText", value: "/" },
      { type: "popover.filter", popover: "command", query: "" },
      { type: "focus.editor" },
    ])
  }
  return changed({ ...state, popover: { type: "command-menu", query: "" }, focus: "command-search" }, [
    { type: "popover.filter", popover: "command", query: "" },
    { type: "focus.command-search" },
  ])
}

function openContext(state: ComposerInteractionState): ComposerEditorTransition {
  return changed({ ...state, popover: { type: "context", query: "" }, focus: "editor" }, [
    { type: "draft.addText", value: "@" },
    { type: "popover.filter", popover: "context", query: "" },
    { type: "focus.editor" },
  ])
}

function queryChanged(state: ComposerInteractionState, query: string): ComposerEditorTransition {
  if (state.popover.type === "closed") return unchanged(state)
  const popover = state.popover.type === "context" ? "context" : "command"
  return changed({ ...state, popover: { ...state.popover, query } }, [{ type: "popover.filter", popover, query }])
}

function suggestionSelected(
  state: ComposerInteractionState,
  item: ComposerSuggestion,
  persisted: ComposerPersistedState,
): ComposerEditorTransition {
  const current = promptText(persisted.prompt)
  const commands: ComposerInteractionCommand[] = []
  if (item.kind === "command") {
    commands.push(
      state.popover.type === "command-menu"
        ? { type: "draft.prependText", value: `${item.label} ` }
        : { type: "draft.setText", value: replaceTrigger(current, "/", `${item.label} `) },
    )
  } else {
    commands.push({
      type: "mention.add",
      item,
      ...(item.kind === "skill" && item.label.startsWith("/")
        ? { range: { start: 0, end: state.popover.type === "command-menu" ? 0 : current.length } }
        : {}),
    })
  }
  commands.push({ type: "focus.editor" })
  return changed({ ...state, popover: { type: "closed" }, focus: "editor" }, commands)
}

function keyDown(
  state: ComposerInteractionState,
  event: Extract<ComposerInteractionEvent, { type: "key.down" }>,
  mode: ComposerMode,
): ComposerEditorTransition {
  if (event.ctrl && event.key.toLowerCase() === "g") {
    if (state.popover.type === "closed") return unchanged(state)
    return changed({ ...state, popover: { type: "closed" }, focus: "editor" }, [{ type: "focus.editor" }], true)
  }
  if (state.popover.type === "closed") {
    if (mode === "shell" && (event.key === "Escape" || (event.key === "Backspace" && event.empty))) {
      return changed({ ...state, history: IDLE_HISTORY }, [{ type: "draft.setMode", mode: "normal" }], true)
    }
    return unchanged(state)
  }
  if (event.key === "Escape") {
    return changed({ ...state, popover: { type: "closed" }, focus: "editor" }, [{ type: "focus.editor" }], true)
  }
  return unchanged(state)
}

/** The driver captures metadata only when the first recall can actually replace the draft. */
export function canStartHistory(
  state: ComposerInteractionState,
  event: Pick<Extract<ComposerInteractionEvent, { type: "history.step" }>, "direction" | "text" | "cursor" | "entries">,
) {
  return (
    state.popover.type === "closed" &&
    state.history.type === "idle" &&
    event.direction === "up" &&
    event.text.length === 0 &&
    Math.max(0, Math.min(event.cursor, event.text.length)) === 0 &&
    event.entries.length > 0
  )
}

function stepHistory(
  state: ComposerInteractionState,
  event: Extract<ComposerInteractionEvent, { type: "history.step" }>,
): ComposerEditorTransition {
  if (state.popover.type !== "closed") return unchanged(state)
  const browsing = state.history.type === "browsing" ? state.history : undefined
  const cursor = Math.max(0, Math.min(event.cursor, event.text.length))
  if (!browsing && !canStartHistory(state, event)) return unchanged(state)
  if (browsing && cursor !== 0 && cursor !== event.text.length) return unchanged(state)

  if (event.direction === "down" && browsing?.index === 0)
    return changed(
      { ...state, history: IDLE_HISTORY },
      [{ type: "history.apply", entry: browsing.saved, position: "end" }],
      true,
    )

  const index = event.direction === "up" ? (browsing ? browsing.index + 1 : 0) : browsing ? browsing.index - 1 : -1
  const entry = event.entries[index]
  if (!entry) return unchanged(state)
  return changed(
    { ...state, history: { type: "browsing", index, saved: browsing?.saved ?? event.saved } },
    [{ type: "history.apply", entry, position: event.direction === "up" ? "start" : "end" }],
    true,
  )
}

function populated(persisted: ComposerPersistedState) {
  return (
    !!promptText(persisted.prompt).trim() ||
    persisted.context.items.length > 0 ||
    persisted.prompt.some((part) => part.type === "file" || isAttachment(part))
  )
}

function replaceTrigger(value: string, trigger: "@" | "/", replacement: string) {
  const index = trigger === "/" ? value.indexOf(trigger) : value.lastIndexOf(trigger)
  return index < 0 ? replacement : value.slice(0, index) + replacement
}

function changed(
  state: ComposerInteractionState,
  commands: ComposerInteractionCommand[] = [],
  handled = false,
): ComposerEditorTransition {
  return { state, commands, handled }
}

function unchanged(state: ComposerInteractionState): ComposerEditorTransition {
  return { state, commands: [], handled: false }
}
