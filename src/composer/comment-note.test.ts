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
})
