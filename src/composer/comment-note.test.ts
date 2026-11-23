import { describe, expect, test } from "bun:test"
import { readCommentMetadata, readPromptPresentation } from "./comment-note"

describe("comment presentation metadata", () => {
  test("recovers valid comments and optional fields without mutating metadata", () => {
    const comment = {
      path: "src/example.ts",
      comment: "Keep this behavior",
      selection: { startLine: "2", startChar: null, endLine: 4, endChar: "0" },
      preview: "example",
      origin: "review",
    }
    const metadata = {
      displayText: "Visible prompt",
      comments: [null, false, { path: 42, comment: "invalid" }, { path: "missing comment" }, comment],
    }
    const original = structuredClone(metadata)
    const expected = {
      path: "src/example.ts",
      comment: "Keep this behavior",
      selection: { startLine: 2, startChar: 0, endLine: 4, endChar: 0 },
      preview: "example",
      origin: "review" as const,
    }
    expect(readPromptPresentation(metadata)).toEqual({ displayText: "Visible prompt", comments: [expected] })
    expect(readCommentMetadata({ opencodeComment: comment })).toEqual(expected)
    expect(metadata).toEqual(original)
  })

  test("drops invalid optional fields while retaining an otherwise valid comment", () => {
    const comment = {
      path: "",
      comment: "",
      selection: { startLine: 1, startChar: 0, endLine: Infinity, endChar: 0 },
      preview: false,
      origin: "unknown",
    }
    const expected = { path: "", comment: "", selection: undefined, preview: undefined, origin: undefined }
    expect(readCommentMetadata({ opencodeComment: comment })).toEqual(expected)
    expect(readPromptPresentation({ displayText: "", comments: [comment] })).toEqual({
      displayText: "",
      comments: [expected],
    })
    for (const value of [undefined, null, false, {}, { displayText: "visible" }, { displayText: 42, comments: [] }]) {
      expect(readPromptPresentation(value)).toBeUndefined()
      expect(readCommentMetadata(value)).toBeUndefined()
    }
  })

  test("reads ordered timeline cards and server-file references independently", () => {
    const file = { path: "src/app.ts", comment: "Keep this" }
    const quote = { type: "quote", text: "first line\nsecond line" } as const
    const source = { label: "Terminal", icon: "terminal", subject: "the command output" }
    const note = {
      type: "note",
      origin: "browser",
      subject: "the settings button",
      label: "Button",
      icon: "select-element",
      title: "Settings",
      subtitle: "Preferences",
      comment: "",
      live: { subject: "the current tab" },
    }
    const browser = {
      type: "browser",
      tabID: "tab_1",
      url: "https://example.org",
      element: { selector: "#save", label: "Save", ref: "e1" },
      comment: "Rename this button",
    }
    const reference = { name: "report.csv", mime: "text/csv", path: "/workspace/report.csv" }
    const second = { name: "notes.txt", mime: "text/plain", path: "/workspace/notes.txt" }
    const metadata = {
      displayText: "",
      comments: [
        quote,
        { ...quote, source, comment: "Explain this" },
        { ...quote, source: { label: 5 } },
        { ...quote, text: 42 },
        note,
        { ...note, icon: false, path: "invalid.ts" },
        file,
        browser,
        { ...browser, element: { label: "Missing selector" }, path: "invalid.ts" },
      ],
      attachments: [reference, null, { ...reference, mime: false }, second],
    }
    const original = structuredClone(metadata)
    const result = readPromptPresentation(metadata)
    expect(result).toEqual({
      displayText: "",
      comments: [
        quote,
        { ...quote, source: { label: "Terminal", icon: "terminal" }, comment: "Explain this" },
        quote,
        {
          type: "note",
          label: "Button",
          icon: "select-element",
          title: "Settings",
          subtitle: "Preferences",
          comment: "",
        },
        file,
        { type: "note", label: "Save", icon: "select-element", comment: "Rename this button" },
      ],
      references: [reference, second],
    })
    expect(metadata).toEqual(original)
    expect(result?.references?.[0]).not.toBe(reference)
    expect(readPromptPresentation({ displayText: "", comments: [quote], attachments: "invalid" })?.comments).toEqual([
      quote,
    ])
  })
})
