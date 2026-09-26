import { describe, expect, mock, test } from "bun:test"
import { createStore } from "solid-js/store"
import { renderToString } from "solid-js/web"
import type { ComposerPersistedState } from "../types"
import { createComposerEditor, shouldHandlePasteAsAttachment } from "./interaction"
import { createComposerHistory } from "../history/store"

test("inserts successive workspace files at the cursor without replacing an earlier mention", () => {
  renderToString(() => {
    const store = createStore<ComposerPersistedState>({ prompt: [], cursor: 0, context: { items: [] } })
    const editor = createComposerEditor({
      store,
      commands: () => [],
      context: () => [],
      searchContextFiles: () => [],
      view: { submit: { stopping: () => false, onSubmit() {}, onStop() {} } },
    })
    editor.addFile({ type: "file", path: "one.txt", content: "@one.txt", start: 0, end: 0 })
    editor.addFile({ type: "file", path: "two.txt", content: "@two.txt", start: 0, end: 0 })
    expect(editor.value()).toBe("@one.txt @two.txt ")
    expect(
      editor
        .parts()
        .filter((part) => part.type === "file")
        .map((part) => ({ path: part.path, start: part.start, end: part.end })),
    ).toEqual([
      { path: "one.txt", start: 0, end: 8 },
      { path: "two.txt", start: 9, end: 17 },
    ])
    return ""
  })
})

describe("composer submission admission", () => {
  test("preserves the draft while submission is unavailable and still allows interruption", () => {
    renderToString(() => {
      let available = false
      const store = createStore<ComposerPersistedState>({
        prompt: [{ type: "text", content: "unsent draft", start: 0, end: 12 }],
        context: { items: [] },
      })
      const onSubmit = mock(() => {})
      const onStop = mock(() => {})
      const editor = createComposerEditor({
        store,
        commands: () => [],
        context: () => [],
        searchContextFiles: () => [],
        view: { submit: { available: () => available, enabled: () => true, stopping: () => true, onSubmit, onStop } },
      })
      expect(editor.canSubmit()).toBe(false)
      editor.submit()
      editor.submit({ alternate: true })
      editor.stop()
      expect(onSubmit).not.toHaveBeenCalled()
      expect(onStop).toHaveBeenCalledTimes(1)
      expect(store[0].prompt).toEqual([{ type: "text", content: "unsent draft", start: 0, end: 12 }])
      available = true
      expect(editor.canSubmit()).toBe(true)
      editor.submit()
      expect(onSubmit).toHaveBeenCalledTimes(1)
      return ""
    })
  })

  test("blocks direct submissions while disabled and allows them after enabling", () => {
    renderToString(() => {
      let enabled = false
      const onSubmit = mock(() => {})
      const onStop = mock(() => {})
      const editor = createComposerEditor({
        store: createStore<ComposerPersistedState>({
          prompt: [{ type: "text", content: "unsent draft", start: 0, end: 12 }],
          context: { items: [] },
        }),
        commands: () => [],
        context: () => [],
        searchContextFiles: () => [],
        view: { submit: { enabled: () => enabled, stopping: () => true, onSubmit, onStop } },
      })

      expect(editor.canSubmit()).toBe(false)
      editor.submit()
      editor.submit({ alternate: true })
      expect(onSubmit).not.toHaveBeenCalled()
      editor.stop()
      expect(onStop).toHaveBeenCalledTimes(1)

      enabled = true
      expect(editor.canSubmit()).toBe(true)
      editor.submit()
      expect(onSubmit).toHaveBeenCalledTimes(1)
      return ""
    })
  })
})

describe("composer paste", () => {
  test.each([
    { types: [], native: false, expected: false },
    { types: [], native: true, expected: true },
    { types: ["text/plain"], native: true, expected: false },
    { types: ["text/html"], native: true, expected: false },
    { types: ["text/uri-list"], native: true, expected: false },
  ])("routes clipboard types $types with native image support $native", ({ types, native, expected }) => {
    const clipboard = { types, items: [] } as unknown as DataTransfer
    expect(shouldHandlePasteAsAttachment(clipboard, native)).toBe(expected)
  })

  test("handles files even when text is also on the clipboard", () => {
    const clipboard = { types: ["text/plain", "Files"], items: [{ kind: "file" }] } as unknown as DataTransfer
    expect(shouldHandlePasteAsAttachment(clipboard, false)).toBe(true)
  })

  test("does not swallow an HTML-only paste or request a native clipboard image", () => {
    renderToString(() => {
      const readClipboardImage = mock(async () => null)
      const preventDefault = mock(() => {})
      const editor = createComposerEditor({
        store: createStore<ComposerPersistedState>({ prompt: [], context: { items: [] } }),
        commands: () => [],
        context: () => [],
        searchContextFiles: () => [],
        attachments: {
          directory: () => "",
          isDialogActive: () => false,
          warn() {},
          duplicate() {},
          onError() {},
          readClipboardImage,
        },
        view: { submit: { stopping: () => false, onSubmit() {}, onStop() {} } },
      })
      // A cursor already exists, so attachment capture does not need a browser selection.
      editor.onCursor(0)
      editor.setEditor({} as HTMLElement)
      editor.onPaste({
        clipboardData: { types: ["text/html"], items: [], getData: () => "" },
        preventDefault,
        stopPropagation() {},
      } as unknown as ClipboardEvent)
      expect(preventDefault).not.toHaveBeenCalled()
      expect(readClipboardImage).not.toHaveBeenCalled()
      return ""
    })
  })

  test.each([
    { text: "one line", command: "insertText", value: "one line" },
    { text: "one\r\ntwo\rthree", command: "insertHTML", value: "one\ntwo\nthree" },
    { text: "<b>plain</b> & text\nnext", command: "insertHTML", value: "&lt;b&gt;plain&lt;/b&gt; &amp; text\nnext" },
    { text: "one\n\ntwo\n", command: "insertHTML", value: "one\n\ntwo\n" },
  ])("pastes $text in one native edit", ({ text, command, value }) => {
    const execCommand = mock(() => true)
    const preventDefault = mock(() => {})
    const previous = Object.getOwnPropertyDescriptor(globalThis, "document")
    Object.defineProperty(globalThis, "document", { configurable: true, value: { execCommand } })
    try {
      renderToString(() => {
        const editor = createComposerEditor({
          store: createStore<ComposerPersistedState>({
            prompt: [{ type: "text", content: "", start: 0, end: 0 }],
            context: { items: [] },
          }),
          commands: () => [],
          context: () => [],
          searchContextFiles: () => [],
          view: { submit: { stopping: () => false, onSubmit() {}, onStop() {} } },
        })

        editor.onPaste({ clipboardData: { getData: () => text }, preventDefault } as unknown as ClipboardEvent)

        expect(preventDefault).toHaveBeenCalledTimes(1)
        expect(execCommand).toHaveBeenCalledTimes(1)
        expect(execCommand).toHaveBeenCalledWith(command, false, value)
        return ""
      })
    } finally {
      if (previous) Object.defineProperty(globalThis, "document", previous)
      else delete (globalThis as { document?: typeof globalThis.document }).document
    }
  })
})

describe("composer history navigation", () => {
  test("recalls older prompts at the boundary and restores the attachment draft", () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
    const previousFrame = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame")
    try {
      renderToString(() => {
        const history = createComposerHistory()
        history.add([{ type: "text", content: "older", start: 0, end: 5 }], "normal")
        history.add([{ type: "text", content: "newer", start: 0, end: 5 }], "normal")
        const original: ComposerPersistedState["prompt"] = [
          {
            type: "image",
            id: "draft",
            filename: "draft.png",
            mime: "image/png",
            blob: { id: "draft", url: "data:image/png;base64,YQ==" },
          },
        ]
        const store = createStore<ComposerPersistedState>({ prompt: original, cursor: 0, context: { items: [] } })
        const editor = createComposerEditor({
          store,
          history,
          commands: () => [],
          context: () => [],
          searchContextFiles: () => [],
          view: { submit: { stopping: () => false, onSubmit() {}, onStop() {} } },
        })
        let collapsed = true
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: {
            getSelection: () => ({
              isCollapsed: collapsed,
              anchorNode: {},
              anchorOffset: 0,
              rangeCount: 1,
              getRangeAt: () => ({
                cloneRange: () => ({
                  selectNodeContents() {},
                  setEnd() {},
                  toString: () => "x".repeat(store[0].cursor ?? 0),
                }),
              }),
            }),
          },
        })
        Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: () => 1 })
        editor.setEditor({ contains: () => true } as unknown as HTMLElement)
        const key = (key: string, extra = {}) => {
          const event = { key, preventDefault: mock(() => {}), ...extra } as unknown as KeyboardEvent
          editor.onKeyDown(event)
          return event
        }
        expect(key("ArrowUp", { shiftKey: true }).preventDefault).not.toHaveBeenCalled()
        expect(key("ArrowUp", { isComposing: true }).preventDefault).not.toHaveBeenCalled()
        expect(editor.value()).toBe("")
        expect(key("ArrowUp").preventDefault).toHaveBeenCalledTimes(1)
        expect(editor.value()).toBe("newer")
        expect(key("ArrowUp").preventDefault).toHaveBeenCalledTimes(1)
        expect(editor.value()).toBe("older")
        expect(key("ArrowDown").preventDefault).toHaveBeenCalledTimes(1)
        expect(editor.value()).toBe("newer")
        editor.onCursor(2)
        expect(key("ArrowDown").preventDefault).not.toHaveBeenCalled()
        editor.onCursor(5)
        collapsed = false
        expect(key("ArrowDown").preventDefault).not.toHaveBeenCalled()
        collapsed = true
        expect(key("ArrowDown").preventDefault).toHaveBeenCalledTimes(1)
        expect(store[0].prompt).toEqual([
          {
            type: "image",
            id: "draft",
            filename: "draft.png",
            mime: "image/png",
            blob: { id: "draft", url: "data:image/png;base64,YQ==" },
          },
        ])
        expect(history.entries("normal")[0].prompt).toEqual([{ type: "text", content: "newer", start: 0, end: 5 }])
        editor.onInput("unsent text")
        editor.onCursor(0)
        expect(key("ArrowUp").preventDefault).not.toHaveBeenCalled()
        expect(editor.value()).toBe("unsent text")
        return ""
      })
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
      else delete (globalThis as { window?: typeof globalThis.window }).window
      if (previousFrame) Object.defineProperty(globalThis, "requestAnimationFrame", previousFrame)
      else
        delete (globalThis as { requestAnimationFrame?: typeof globalThis.requestAnimationFrame }).requestAnimationFrame
    }
  })
})
