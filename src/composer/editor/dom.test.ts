import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { installDOM } from "@/test/dom"
import { getCursorPosition, parseComposerEditor, pasteComposerText, setCursorPosition } from "./dom"
import { promptText } from "../prompt-parts"

let cleanup: () => void

beforeEach(() => {
  cleanup = installDOM()
})

afterEach(() => {
  mock.restore()
  cleanup()
})

// The expected offsets are literal prompt offsets, independent of the caret implementation.
test.each([
  { name: "line breaks", html: "ab<br>cd", text: "ab\ncd", positions: [0, 2, 3, 4, 5] },
  { name: "blank lines", html: "a<br><br>b", text: "a\n\nb", positions: [0, 1, 2, 3, 4] },
  {
    name: "file mentions",
    html: 'ab<span data-mention="file" data-path="file" contenteditable="false">@file</span><br>cd',
    text: "ab@file\ncd",
    positions: [0, 2, 7, 8, 10],
  },
  {
    name: "nested text and mentions",
    html: '<span>a<b>b</b><span data-mention="agent" contenteditable="false">@agent</span></span><br>c',
    text: "ab@agent\nc",
    positions: [0, 1, 2, 8, 9, 10],
  },
  { name: "literal Unicode text", html: "a\u200B😀<br>b", text: "a\u200B😀\nb", positions: [0, 1, 2, 4, 5, 6] },
])("maps the caret to prompt offsets across $name", ({ html, text, positions }) => {
  const editor = document.createElement("div")
  editor.innerHTML = html
  document.body.append(editor)
  expect(promptText(parseComposerEditor(editor))).toBe(text)
  for (const position of positions) {
    setCursorPosition(editor, position)
    const selection = window.getSelection()!
    expect(editor.contains(selection.anchorNode)).toBe(true)
    expect(selection.isCollapsed).toBe(true)
    const anchor = selection.anchorNode
    const element = anchor instanceof HTMLElement ? anchor : anchor?.parentElement
    expect(element?.closest("[data-mention]") === null).toBe(true)
    expect(getCursorPosition(editor)).toBe(position)
  }
})

test("reads a browser caret after a break before inserting a mention", () => {
  const editor = document.createElement("div")
  editor.innerHTML = "first<br>@fi"
  document.body.append(editor)
  const range = document.createRange()
  range.setStart(editor.lastChild!, 3)
  range.collapse(true)
  window.getSelection()!.addRange(range)
  expect(getCursorPosition(editor)).toBe(9)
})

test("keeps a restored caret outside an atomic mention", () => {
  const editor = document.createElement("div")
  editor.innerHTML = '<span data-mention="file" contenteditable="false">@file</span>'
  document.body.append(editor)
  for (const [position, offset] of [
    [0, 0],
    [2, 1],
    [5, 1],
  ]) {
    setCursorPosition(editor, position)
    expect(window.getSelection()!.anchorNode === editor).toBe(true)
    expect(window.getSelection()!.anchorOffset).toBe(offset)
  }
})

test.each(["", "abc", "a<br>"])("restores an empty or out-of-range caret in %j", (html) => {
  const editor = document.createElement("div")
  editor.innerHTML = html
  document.body.append(editor)
  setCursorPosition(editor, 100)
  expect(editor.contains(window.getSelection()!.anchorNode)).toBe(true)
  expect(getCursorPosition(editor)).toBe(html === "" ? 0 : html === "abc" ? 3 : 2)
  setCursorPosition(editor, -1)
  expect(getCursorPosition(editor)).toBe(0)
})

test("falls back to one plain-text edit, replacing the selection and retaining adjacent mentions", () => {
  const editor = document.createElement("div")
  editor.innerHTML = '<span data-mention="agent" data-name="agent" contenteditable="false">@agent</span> old tail'
  document.body.append(editor)
  const range = document.createRange()
  range.setStart(editor.lastChild!, 1)
  range.setEnd(editor.lastChild!, 4)
  window.getSelection()!.addRange(range)
  spyOn(document, "execCommand").mockReturnValue(false)
  const edits: { text: string; cursor: number; type: string; data: string | null }[] = []
  editor.addEventListener("input", (event) => {
    const input = event as InputEvent
    edits.push({
      text: promptText(parseComposerEditor(editor)),
      cursor: getCursorPosition(editor),
      type: input.inputType,
      data: input.data,
    })
  })
  const preventDefault = mock(() => {})

  pasteComposerText({
    currentTarget: editor,
    clipboardData: { getData: () => "<b>&\r\nnext" },
    preventDefault,
  } as unknown as ClipboardEvent)

  expect(preventDefault).toHaveBeenCalledTimes(1)
  expect(parseComposerEditor(editor)[0]).toEqual({
    type: "agent",
    name: "agent",
    content: "@agent",
    start: 0,
    end: 6,
  })
  expect(editor.querySelector("b")).toBeNull()
  expect(edits).toEqual([{ text: "@agent <b>&\nnext tail", cursor: 16, type: "insertFromPaste", data: "<b>&\nnext" }])
  expect(window.getSelection()!.isCollapsed).toBe(true)
})

test.each(["absent", "external"])("does not apply fallback paste to an %s selection", (selection) => {
  const editor = document.createElement("div")
  editor.textContent = "draft"
  const outside = document.createElement("div")
  outside.textContent = "outside"
  document.body.append(editor, outside)
  if (selection === "external") setCursorPosition(outside, 3)
  const descriptor = Object.getOwnPropertyDescriptor(document, "execCommand")
  Object.defineProperty(document, "execCommand", { configurable: true, value: undefined })
  try {
    const onInput = mock(() => {})
    editor.addEventListener("input", onInput)
    pasteComposerText({
      currentTarget: editor,
      clipboardData: { getData: () => "replacement" },
      preventDefault() {},
    } as unknown as ClipboardEvent)
    expect(editor.textContent).toBe("draft")
    expect(outside.textContent).toBe("outside")
    expect(onInput).not.toHaveBeenCalled()
  } finally {
    if (descriptor) Object.defineProperty(document, "execCommand", descriptor)
    else Reflect.deleteProperty(document, "execCommand")
  }
})
