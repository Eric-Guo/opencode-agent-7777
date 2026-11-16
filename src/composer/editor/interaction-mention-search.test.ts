import { afterEach, expect, jest, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createPromptState } from "../state"
import type { ComposerSuggestion } from "../types"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import { createComposerEditor } from "./interaction"

browserSuite(import.meta.path, () => {
  const disposers: (() => void)[] = []
  afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    jest.useRealTimers()
  })
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve()
  }
  const type = (editor: ReturnType<typeof createComposerEditor>, value: string) =>
    editor.onInput(value, [{ type: "text", content: value, start: 0, end: value.length }], value.length)
  function fixture() {
    jest.useFakeTimers()
    const calls: {
      query: string
      signal?: AbortSignal
      result: ReturnType<typeof Promise.withResolvers<ComposerSuggestion[]>>
    }[] = []
    return createRoot((dispose) => {
      disposers.push(dispose)
      const draft = createPromptState()
      const [identity, setIdentity] = createSignal("first")
      const [source, setSource] = createSignal<object>({})
      const editor = createComposerEditor({
        store: draft.store,
        scope: draft.scope,
        identity,
        searchSource: source,
        commands: () => [],
        context: () => [
          { id: "recent", kind: "file", label: "recent.ts", recent: true },
          ...["alpha", "beta"].map((name) => ({ id: `skill:${name}`, kind: "skill" as const, label: `@${name}` })),
        ],
        searchContextFiles(query, signal) {
          const result = Promise.withResolvers<ComposerSuggestion[]>()
          calls.push({ query, signal, result })
          return result.promise
        },
        view: { submit: { stopping: () => false, onSubmit() {}, onStop() {} } },
      })
      return { editor, draft, calls, setIdentity, setSource, dispose }
    })
  }

  test("typing debounces file requests while current local rows remain immediately available", async () => {
    const { editor, calls } = fixture()
    type(editor, "@")
    expect(editor.suggestions().map((item) => item.id)).toEqual(["skill:alpha", "skill:beta", "recent"])
    jest.advanceTimersByTime(200)
    expect(calls).toHaveLength(0)
    type(editor, "@al")
    jest.advanceTimersByTime(149)
    type(editor, "@alpha")
    jest.advanceTimersByTime(149)
    expect(calls).toHaveLength(0)
    jest.advanceTimersByTime(1)
    expect(calls.map((call) => call.query)).toEqual(["alpha"])
    calls[0].result.resolve([{ id: "old", kind: "file", label: "old.ts" }])
    await flush()
    expect(editor.suggestions().map((item) => item.id)).toEqual(["skill:alpha", "old"])
    type(editor, "@beta")
    expect(editor.suggestions().map((item) => item.id)).toEqual(["skill:beta"])
    expect(editor.fileSearchStatus()).toBe("loading")
    editor.dispatch({ type: "popover.close" })
    jest.advanceTimersByTime(150)
    expect(calls).toHaveLength(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  test.each(["close", "reset", "identity", "source", "dispose"] as const)(
    "%s cancels current work and rejects a late result even for the same query",
    async (exit) => {
      const { editor, calls, draft, setIdentity, setSource, dispose } = fixture()
      type(editor, "@src")
      jest.advanceTimersByTime(150)
      if (exit === "close") editor.dispatch({ type: "popover.close" })
      if (exit === "reset") draft.reset()
      if (exit === "identity") setIdentity("second")
      if (exit === "source") setSource({})
      if (exit === "dispose") dispose()
      expect(calls[0].signal?.aborted).toBe(true)
      if (exit !== "dispose") {
        type(editor, "@src")
        jest.advanceTimersByTime(150)
        expect(calls).toHaveLength(2)
      }
      calls[0].result.resolve([{ id: "late", kind: "file", label: "late.ts" }])
      await flush()
      expect(editor.suggestions().some((item) => item.id === "late")).toBe(false)
      if (exit !== "dispose") {
        expect(editor.fileSearchStatus()).toBe("loading")
        calls[1].result.resolve([{ id: "fresh", kind: "file", label: "fresh.ts" }])
        await flush()
        expect(editor.suggestions().map((item) => item.id)).toEqual(["fresh"])
        expect(editor.fileSearchStatus()).toBe("ready")
      }
    },
  )

  test.each(["failure", "timeout"] as const)(
    "%s releases loading, retains local rows and permits a fresh search",
    async (exit) => {
      const { editor, calls } = fixture()
      type(editor, "@alpha")
      jest.advanceTimersByTime(150)
      if (exit === "failure") calls[0].result.reject(new Error("Offline"))
      else jest.advanceTimersByTime(10_000)
      await flush()
      expect(editor.fileSearchStatus()).toBe("failed")
      expect(calls[0].signal?.aborted).toBe(true)
      expect(editor.suggestions().map((item) => item.id)).toEqual(["skill:alpha"])
      calls[0].result.resolve([{ id: "late", kind: "file", label: "late.ts" }])
      await flush()
      expect(editor.fileSearchStatus()).toBe("failed")
      type(editor, "@beta")
      jest.advanceTimersByTime(150)
      calls[1].result.resolve([])
      await flush()
      expect(editor.fileSearchStatus()).toBe("ready")
      expect(editor.suggestions().map((item) => item.id)).toEqual(["skill:beta"])
      expect(calls).toHaveLength(2)
      expect(jest.getTimerCount()).toBe(0)
    },
  )
})
