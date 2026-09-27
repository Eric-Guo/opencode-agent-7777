import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import { closeSessionTab, openSessionTab, previewSessionTab, type SessionTabState } from "./session-tabs"

describe("local session file tabs", () => {
  test("replaces previews in place while preserving retained files", () => {
    const current: SessionTabState = { tabs: { all: ["notes.txt", "a.txt"], active: "a.txt" }, preview: "a.txt" }
    expect(previewSessionTab(current, "b.txt")).toEqual({
      tabs: { all: ["notes.txt", "b.txt"], active: "b.txt" },
      preview: "b.txt",
    })
    expect(current).toEqual({ tabs: { all: ["notes.txt", "a.txt"], active: "a.txt" }, preview: "a.txt" })
  })

  test("retains a preview on double click without duplicating it", () => {
    const preview = previewSessionTab({ tabs: { all: [] } }, "notes.txt")
    const retained = openSessionTab(preview, "notes.txt")
    expect(retained).toEqual({ tabs: { all: ["notes.txt"], active: "notes.txt" }, preview: undefined })
    expect(previewSessionTab(retained, "next.txt")).toEqual({
      tabs: { all: ["notes.txt", "next.txt"], active: "next.txt" },
      preview: "next.txt",
    })
  })

  test("opening an existing file removes the temporary preview", () => {
    const current: SessionTabState = {
      tabs: { all: ["notes.txt", "preview.txt"], active: "preview.txt" },
      preview: "preview.txt",
    }
    expect(previewSessionTab(current, "notes.txt")).toEqual({
      tabs: { all: ["notes.txt"], active: "notes.txt" },
      preview: undefined,
    })
    expect(openSessionTab(current, "new.txt")).toEqual({
      tabs: { all: ["notes.txt", "new.txt"], active: "new.txt" },
      preview: undefined,
    })
  })

  test.each([
    ["a.txt", "a.txt", "b.txt"],
    ["b.txt", "b.txt", "a.txt"],
    ["c.txt", "c.txt", "b.txt"],
    ["a.txt", "b.txt", "b.txt"],
    ["b.txt", undefined, undefined],
    ["missing.txt", "b.txt", "b.txt"],
  ])("closing %s with %s active selects %s", (closing, active, expected) => {
    const next = closeSessionTab({ tabs: { all: ["a.txt", "b.txt", "c.txt"], active }, preview: "b.txt" }, closing!)
    expect(next.tabs.active).toBe(expected)
    expect(next.tabs.all).toEqual(["a.txt", "b.txt", "c.txt"].filter((path) => path !== closing))
    expect(next.preview).toBe(closing === "b.txt" ? undefined : "b.txt")
  })

  test("closing the last file returns to the conversation", () => {
    expect(
      closeSessionTab({ tabs: { all: ["notes.txt"], active: "notes.txt" }, preview: "notes.txt" }, "notes.txt"),
    ).toEqual({ tabs: { all: [], active: undefined }, preview: undefined })
  })

  test("Solid updates clear preview metadata and reset active tabs", () => {
    const [state, setState] = createStore<SessionTabState>({ tabs: { all: [] } })
    setState(previewSessionTab(state, "notes.txt"))
    setState(openSessionTab(state, "notes.txt"))
    expect(state.preview).toBeUndefined()
    setState(previewSessionTab(state, "preview.txt"))
    setState("tabs", "active", undefined)
    expect(state.tabs.all).toEqual(["notes.txt", "preview.txt"])
    setState({ tabs: { all: [], active: undefined }, preview: undefined })
    expect(state).toEqual({ tabs: { all: [], active: undefined }, preview: undefined })
    setState(openSessionTab(state, "other.txt"))
    expect(state).toEqual({ tabs: { all: ["other.txt"], active: "other.txt" }, preview: undefined })
  })
})
