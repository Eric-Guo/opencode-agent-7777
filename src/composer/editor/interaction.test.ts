import { describe, expect, mock, test } from "bun:test"
import { createStore } from "solid-js/store"
import { renderToString } from "solid-js/web"
import type { ComposerPersistedState } from "../types"
import { createComposerEditor } from "./interaction"

describe("composer submission admission", () => {
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
      else Reflect.deleteProperty(globalThis, "document")
    }
  })
})
