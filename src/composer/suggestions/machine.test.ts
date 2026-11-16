import { describe, expect, test } from "bun:test"
import type { ComposerPersistedState, ComposerSuggestion } from "../types"
import { createComposerInteractionState, selectComposerMode, transitionComposer } from "./machine"

const command: ComposerSuggestion = {
  id: "review",
  kind: "command",
  label: "/review",
}

function persisted(value = ""): ComposerPersistedState {
  return {
    prompt: [{ type: "text", content: value, start: 0, end: value.length }],
    cursor: value.length,
    context: { items: [] },
  }
}

describe("Composer interaction machine", () => {
  test("opens inline commands only when slash is the entire prompt", () => {
    const state = createComposerInteractionState()
    const open = transitionComposer(state, { type: "input.changed", value: "/re" }, persisted())
    const closed = transitionComposer(state, { type: "input.changed", value: "explain /re" }, persisted())

    expect(open.state.popover).toEqual({ type: "command-inline", query: "re" })
    expect(closed.state.popover).toEqual({ type: "closed" })
  })

  test("completes nested slash command names", () => {
    const open = transitionComposer(
      createComposerInteractionState(),
      { type: "input.changed", value: "/review/" },
      persisted(),
    )
    const item = { ...command, label: "/review/nested" }
    const selected = transitionComposer(open.state, { type: "popover.select", item }, persisted("/review/"))

    expect(open.state.popover).toEqual({ type: "command-inline", query: "review/" })
    expect(selected.commands).toContainEqual({ type: "draft.setText", value: "/review/nested " })
  })

  test("opens context completion at the cursor", () => {
    const value = "alpha @sr omega"
    const input = persisted(value)
    input.cursor = 9

    const result = transitionComposer(
      createComposerInteractionState(),
      { type: "input.changed", value, persist: false },
      input,
    )

    expect(result.state.popover).toEqual({ type: "context", query: "sr" })
  })

  test("enters shell mode from an initial exclamation mark", () => {
    const result = transitionComposer(
      createComposerInteractionState(),
      { type: "input.changed", value: "!", persist: false },
      persisted("!"),
    )

    expect(result.commands).toContainEqual({ type: "draft.setMode", mode: "shell" })
    expect(result.commands).toContainEqual({ type: "draft.setText", value: "" })
  })

  test("keeps disabled triggers as ordinary prompt text", () => {
    const capabilities = { commands: false, context: false, shell: false }

    for (const value of ["!", "/review", "ask @src"]) {
      const result = transitionComposer(
        createComposerInteractionState(),
        { type: "input.changed", value },
        persisted(value),
        capabilities,
      )

      expect(result.commands.some((command) => command.type === "draft.setMode")).toBeFalse()
      expect(result.state.popover).toEqual({ type: "closed" })
      expect(result.commands).toContainEqual({ type: "draft.setText", value })
    }
  })

  test("leaves shell mode with escape", () => {
    const state = createComposerInteractionState()
    const result = transitionComposer(
      state,
      { type: "key.down", key: "Escape", ctrl: false },
      { ...persisted(), mode: "shell" },
    )

    expect(result.commands).toContainEqual({ type: "draft.setMode", mode: "normal" })
    expect(result.handled).toBeTrue()
  })

  test("leaves shell mode with backspace when empty", () => {
    const state = createComposerInteractionState()
    const result = transitionComposer(
      state,
      { type: "key.down", key: "Backspace", ctrl: false, empty: true },
      { ...persisted(), mode: "shell" },
    )

    expect(result.commands).toContainEqual({ type: "draft.setMode", mode: "normal" })
    expect(result.handled).toBeTrue()
  })

  test("closes a popover with ctrl-g before stopping a run", () => {
    const state = {
      ...createComposerInteractionState(),
      popover: { type: "context" as const, query: "" },
    }
    const result = transitionComposer(state, { type: "key.down", key: "g", ctrl: true }, persisted())

    expect(result.state.popover).toEqual({ type: "closed" })
    expect(result.handled).toBeTrue()
  })

  test("opens the searchable command menu for a populated draft", () => {
    const result = transitionComposer(
      createComposerInteractionState(),
      { type: "commands.open" },
      persisted("existing text"),
    )

    expect(result.state.popover).toEqual({ type: "command-menu", query: "" })
    expect(result.state.focus).toBe("command-search")
  })

  test("prepends a menu command and preserves existing text as arguments", () => {
    const open = transitionComposer(
      createComposerInteractionState(),
      { type: "commands.open" },
      persisted("existing text"),
    )
    const selected = transitionComposer(
      open.state,
      { type: "popover.select", item: command },
      persisted("existing text"),
    )

    expect(selected.commands).toContainEqual({ type: "draft.prependText", value: "/review " })
    expect(selected.state.popover).toEqual({ type: "closed" })
  })

  test("stores selected context files as prompt file parts", () => {
    const item: ComposerSuggestion = {
      id: "src/index.ts",
      kind: "file",
      label: "index.ts",
      path: "src/index.ts",
    }
    const state = {
      ...createComposerInteractionState(),
      popover: { type: "context" as const, query: "index" },
    }

    const selected = transitionComposer(state, { type: "popover.select", item }, persisted("@index"))

    expect(selected.commands).toContainEqual({ type: "mention.add", item })
  })
})

function entry(content: string) {
  return { prompt: [{ type: "text" as const, content, start: 0, end: content.length }] }
}

function step(direction: "up" | "down", text = "", cursor = text.length) {
  return {
    type: "history.step" as const,
    direction,
    text,
    cursor,
    entries: [entry("newer"), entry("older")],
    saved: entry(""),
  }
}

describe("compact history transitions", () => {
  test("recalls at boundaries and restores the original draft after editing a recalled entry", () => {
    const saved = { ...entry(""), metadata: { model: "original" } }
    const first = transitionComposer(createComposerInteractionState(), { ...step("up"), saved }, persisted())
    expect(first.handled).toBeTrue()
    expect(first.state.history).toEqual({ type: "browsing", index: 0, saved })
    expect(first.commands).toEqual([{ type: "history.apply", entry: entry("newer"), position: "start" }])
    const edited = transitionComposer(first.state, { type: "input.changed", value: "edited" }, persisted("newer"))
    expect(edited.state.history).toBe(first.state.history)
    const older = transitionComposer(edited.state, step("up", "edited", 0), persisted("edited"))
    expect(older.state.history).toEqual({ type: "browsing", index: 1, saved })
    const newer = transitionComposer(older.state, step("down", "older"), persisted("older"))
    expect(newer.commands).toEqual([{ type: "history.apply", entry: entry("newer"), position: "end" }])
    const restored = transitionComposer(newer.state, step("down", "newer"), persisted("newer"))
    expect(restored.state.history).toEqual({ type: "idle" })
    expect(restored.commands).toEqual([{ type: "history.apply", entry: saved, position: "end" }])
    expect(first.state.history).toEqual({ type: "browsing", index: 0, saved })
  })

  test("rejects ineligible arrows, oldest overflow, and missing entries without allocating state", () => {
    const initial = createComposerInteractionState()
    for (const event of [step("down"), step("up", "unsent", 0), { ...step("up"), entries: [] }]) {
      const result = transitionComposer(initial, event, persisted())
      expect(result.state).toBe(initial)
      expect(result.handled).toBeFalse()
      expect(result.commands).toEqual([])
    }
    const first = transitionComposer(initial, step("up"), persisted()).state
    expect(transitionComposer(first, step("up", "newer", 2), persisted()).state).toBe(first)
    const oldest = transitionComposer(first, step("up", "newer", -1), persisted()).state
    expect(transitionComposer(oldest, step("up", "older", 99), persisted()).state).toBe(oldest)
    expect(transitionComposer(oldest, { ...step("down", "older"), entries: [] }, persisted()).state).toBe(oldest)
    const open = transitionComposer(first, { type: "commands.open" }, persisted("newer")).state
    expect(transitionComposer(open, step("up"), persisted()).state).toBe(open)
  })

  test("resets recall on explicit reset, owner replacement and mode changes without restoring the draft", () => {
    const browsing = transitionComposer(createComposerInteractionState(), step("up"), persisted()).state
    for (const event of [
      { type: "history.reset" as const },
      { type: "owner.changed" as const },
      { type: "mode.synced" as const, mode: "shell" as const },
      { type: "mode.synced" as const, mode: "normal" as const },
    ]) {
      const result = transitionComposer(browsing, event, persisted())
      expect(result.state.history).toEqual({ type: "idle" })
      expect(result.commands).toEqual([])
      expect(browsing.history.type).toBe("browsing")
    }
  })

  test("mode selectors and commands use the persisted draft and preserve no-op identity", () => {
    const state = createComposerInteractionState()
    expect(selectComposerMode(persisted())).toBe("normal")
    expect(selectComposerMode({ mode: "shell" })).toBe("shell")
    expect(transitionComposer(state, { type: "mode.normal" }, persisted()).state).toBe(state)
    expect(transitionComposer(state, { type: "mode.shell" }, { ...persisted(), mode: "shell" }).state).toBe(state)
    expect(transitionComposer(state, { type: "mode.shell" }, persisted(), { shell: false }).state).toBe(state)
    const shell = transitionComposer(state, { type: "mode.shell" }, persisted())
    expect(shell.commands).toEqual([{ type: "draft.setMode", mode: "shell" }])
    for (const event of ["history.reset", "popover.close", "drag.leave", "focus.external"] as const) {
      expect(transitionComposer(state, { type: event }, persisted()).state).toBe(state)
    }
  })
})
