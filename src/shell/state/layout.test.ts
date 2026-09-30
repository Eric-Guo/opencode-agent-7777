import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createMemo, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { isServer } from "solid-js/web"
import { createSessionLayout, type SessionLayoutScope } from "./layout"

const scope = Object.freeze({
  server: "https://server.example",
  directory: "/workspace",
  storageKey: "meeting.session",
})
const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const saved = new Map<string, string>()

beforeEach(() => {
  saved.clear()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    },
  })
})

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original)
  else Reflect.deleteProperty(globalThis, "localStorage")
})

describe("persisted file tab layout", () => {
  test("restores order and selection, with preview status kept only in memory", () => {
    const first = createSessionLayout().tabs(scope)
    first.open("notes.txt")
    first.open("retained.txt")
    first.preview("preview.txt")
    first.move("preview.txt", 0)
    first.select("retained.txt")
    expect(first.state).toEqual({
      tabs: { all: ["preview.txt", "notes.txt", "retained.txt"], active: "retained.txt" },
      preview: "preview.txt",
    })

    const restored = createSessionLayout().tabs(scope)
    expect(restored.state.tabs).toEqual({ all: ["preview.txt", "notes.txt", "retained.txt"], active: "retained.txt" })
    expect(restored.state.preview).toBeUndefined()
    restored.preview("next.txt")
    expect(restored.state.tabs.all).toEqual(["preview.txt", "notes.txt", "retained.txt", "next.txt"])
    expect(first.state.tabs.all).toEqual(["preview.txt", "notes.txt", "retained.txt"])
  })

  test("restores the conversation selection without closing files", () => {
    const tabs = createSessionLayout().tabs(scope)
    tabs.preview("preview.txt")
    tabs.select()
    expect(createSessionLayout().tabs(scope).state.tabs).toEqual({ all: ["preview.txt"], active: undefined })
    expect(tabs.state.preview).toBe("preview.txt")
  })

  test.each([
    { ...scope, server: "https://other.example" },
    { ...scope, directory: "/other" },
    { ...scope, storageKey: "other-agent.session" },
  ])("isolates a different scope %j across switches and reloads", (other) => {
    const layout = createSessionLayout()
    const first = layout.tabs(scope)
    first.open("first.txt")
    first.preview("temporary.txt")
    const next = layout.tabs(other)
    expect(next.state).toEqual({ tabs: { all: [] } })
    next.open("second.txt")
    expect(layout.tabs({ ...scope })).toBe(first)
    expect(layout.tabs(scope).state).toEqual({
      tabs: { all: ["first.txt", "temporary.txt"], active: "temporary.txt" },
      preview: "temporary.txt",
    })
    first.close("temporary.txt")
    expect(next.state.tabs).toEqual({ all: ["second.txt"], active: "second.txt" })
    const reloaded = createSessionLayout()
    expect(reloaded.tabs(scope).state.tabs).toEqual({ all: ["first.txt"], active: "first.txt" })
    expect(reloaded.tabs(other).state.tabs).toEqual({ all: ["second.txt"], active: "second.txt" })
  })

  test("closing the last file removes only its scope's record and keeps empty stores independent", () => {
    const layout = createSessionLayout()
    const first = layout.tabs(scope)
    const other = layout.tabs({ ...scope, directory: "/other" })
    saved.set(scope.storageKey, "existing-session-id")
    first.open("first.txt")
    other.open("other.txt")
    first.close("first.txt")
    expect(saved.size).toBe(2)
    expect(saved.get(scope.storageKey)).toBe("existing-session-id")
    expect(createSessionLayout().tabs(scope).state.tabs).toEqual({ all: [] })
    expect(other.state.tabs).toEqual({ all: ["other.txt"], active: "other.txt" })
    first.preview("new.txt")
    expect(createSessionLayout().tabs({ ...scope, directory: "/third" }).state.tabs).toEqual({ all: [] })
    expect(scope).toEqual({ server: "https://server.example", directory: "/workspace", storageKey: "meeting.session" })
  })

  test("recovers valid paths and discards duplicate, out-of-workspace, and malformed entries", () => {
    createSessionLayout().tabs(scope).open("seed.txt")
    const key = [...saved.keys()][0]
    saved.set(
      key,
      JSON.stringify({
        all: ["notes.txt", null, "notes.txt", 42, "", "../secret", "/other/file", "/workspace/src/a.ts", "./notes.txt"],
        active: "/workspace/src/a.ts",
        preview: "notes.txt",
      }),
    )
    const tabs = createSessionLayout().tabs(scope)
    expect(tabs.state.tabs).toEqual({ all: ["notes.txt", "src/a.ts"], active: "src/a.ts" })
    expect(tabs.state.preview).toBeUndefined()
    tabs.select("missing.txt")
    tabs.open("/another-workspace/file.txt")
    expect(tabs.state.tabs).toEqual({ all: ["notes.txt", "src/a.ts"], active: "src/a.ts" })
    tabs.close("src/a.ts")
    expect(JSON.parse(saved.get(key)!)).toEqual({ all: ["notes.txt"], active: "notes.txt" })
    saved.set(key, JSON.stringify({ all: ["notes.txt"], active: "missing.txt" }))
    expect(createSessionLayout().tabs(scope).state.tabs).toEqual({ all: ["notes.txt"], active: undefined })
  })

  test.each(["{", "null", "42", '"wrong"', '{"all":{}}', '{"all":[null,false],"active":42}'])(
    "corrupt storage %s recovers without overwriting on hydration",
    (value) => {
      createSessionLayout().tabs(scope).open("seed.txt")
      const key = [...saved.keys()][0]
      saved.set(key, value)
      const tabs = createSessionLayout().tabs(scope)
      expect(tabs.state.tabs.all).toEqual([])
      expect(tabs.state.tabs.active).toBeUndefined()
      expect(saved.get(key)).toBe(value)
      tabs.open("recovered.txt")
      expect(createSessionLayout().tabs(scope).state.tabs).toEqual({ all: ["recovered.txt"], active: "recovered.txt" })
    },
  )

  test("retains Windows file identity across restoration and subsequent file-tree clicks", () => {
    const windows = { ...scope, directory: "C:\\Workspace" }
    const tabs = createSessionLayout().tabs(windows)
    tabs.open("C:\\Workspace\\src\\a.ts")
    tabs.preview("src\\b.ts")
    const restored = createSessionLayout().tabs(windows)
    restored.preview("src/b.ts")
    expect(restored.state.tabs).toEqual({ all: ["src/a.ts", "src/b.ts"], active: "src/b.ts" })
    restored.close("src\\b.ts")
    expect(createSessionLayout().tabs(windows).state.tabs).toEqual({ all: ["src/a.ts"], active: "src/a.ts" })
  })

  test("incomplete initialization cannot change or persist tabs", () => {
    const layout = createSessionLayout()
    for (const input of [
      undefined,
      { ...scope, server: "" },
      { ...scope, directory: "" },
      { ...scope, storageKey: "" },
    ]) {
      layout.tabs(input).open("ignored.txt")
      expect(layout.tabs(input).state).toEqual({ tabs: { all: [] } })
    }
    expect(saved.size).toBe(0)
    layout.tabs(scope).open("ready.txt")
    expect(layout.tabs().state).toEqual({ tabs: { all: [] } })
    expect(createSessionLayout().tabs(scope).state.tabs).toEqual({ all: ["ready.txt"], active: "ready.txt" })
  })

  test.each(["missing", "getter", "operations"])("keeps tabs usable in memory with %s storage", (mode) => {
    const fail = () => {
      throw new Error("Storage unavailable")
    }
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      ...(mode === "getter"
        ? { get: fail }
        : { value: mode === "missing" ? undefined : { getItem: fail, setItem: fail, removeItem: fail } }),
    })
    const layout = createSessionLayout()
    layout.tabs(scope).open("notes.txt")
    layout.tabs(scope).preview("preview.txt")
    layout.tabs(scope).move("preview.txt", 0)
    layout.tabs({ ...scope, directory: "/other" }).open("other.txt")
    expect(layout.tabs(scope).state).toEqual({
      tabs: { all: ["preview.txt", "notes.txt"], active: "preview.txt" },
      preview: "preview.txt",
    })
    layout.tabs(scope).close("preview.txt")
    layout.tabs(scope).close("notes.txt")
    expect(layout.tabs(scope).state.tabs).toEqual({ all: [], active: undefined })
  })

  test("reactive workspace switching restores the correct store without cross-scope writes", () => {
    if (isServer) {
      const result = Bun.spawnSync([
        process.execPath,
        "--conditions=browser",
        "test",
        import.meta.path,
        "--test-name-pattern",
        "reactive workspace switching",
      ])
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      return
    }
    createRoot((dispose) => {
      try {
        const [source, setSource] = createStore<{ scope?: SessionLayoutScope }>({})
        const layout = createSessionLayout()
        const tabs = createMemo(() => layout.tabs(source.scope))
        expect(tabs().state.tabs.all).toEqual([])
        setSource("scope", { ...scope })
        tabs().open("first.txt")
        setSource("scope", "directory", "/other")
        expect(tabs().state.tabs.all).toEqual([])
        tabs().open("second.txt")
        setSource("scope", undefined)
        expect(tabs().state.tabs.all).toEqual([])
        setSource("scope", { ...scope })
        expect(tabs().state.tabs).toEqual({ all: ["first.txt"], active: "first.txt" })
        tabs().select()
        const restored = createSessionLayout()
        expect(restored.tabs(scope).state.tabs).toEqual({ all: ["first.txt"], active: undefined })
        expect(restored.tabs({ ...scope, directory: "/other" }).state.tabs).toEqual({
          all: ["second.txt"],
          active: "second.txt",
        })
      } finally {
        dispose()
      }
    })
  })
})
