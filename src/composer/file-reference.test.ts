import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { createPromptState } from "./state"
import { buildPromptRequest } from "./request"
import { PromptDraft, PromptHistoryState } from "./schema"
import { prependHistoryEntry } from "./history/entry"
import { pathToFileUrl } from "@/session/files/file-tree"

describe("workspace file references", () => {
  test("preserves references and encoded URIs through persistence, history, and submission", () => {
    const state = createPromptState()
    const reference = {
      type: "file" as const,
      path: "docs/a #1.md",
      content: "@docs/a #1.md",
      start: 2,
      end: 15,
      url: "file:///workspace/docs/a%20%231.md",
    }
    // Derive the offsets from the actual content, as the editor does.
    reference.end = reference.start + reference.content.length
    state.store[1]("prompt", [
      { type: "text", content: "  ", start: 0, end: 2 },
      { ...reference },
      { type: "text", content: " inspect ", start: reference.end, end: reference.end + 9 },
    ])
    const draft = Schema.decodeUnknownSync(Schema.fromJsonString(PromptDraft))(JSON.stringify(state.capture()))
    const restored = createPromptState(draft)
    expect(restored.store[0].prompt[1]).toEqual(reference)
    expect(buildPromptRequest(restored.capture())).toEqual({
      text: "@docs/a #1.md inspect",
      files: [
        {
          uri: "file:///workspace/docs/a%20%231.md",
          name: "a #1.md",
          mention: { start: 0, end: reference.content.length, text: "@docs/a #1.md" },
        },
      ],
    })
    const history = Schema.decodeUnknownSync(Schema.fromJsonString(PromptHistoryState))(
      JSON.stringify({ entries: prependHistoryEntry([], state.store[0].prompt) }),
    )
    state.store[1]("prompt", 1, (part) => (part.type === "file" ? { ...part, content: "changed" } : part))
    expect(history.entries[0]?.prompt[1]).toEqual(reference)
    expect(draft.references?.[0]).toEqual(reference)
  })

  test("does not restore invalid mention offsets as file attachments", () => {
    const state = createPromptState({
      prompt: "edited draft",
      attachments: [],
      references: [{ type: "file", path: "old.txt", content: "@old.txt", start: 0, end: 8 }],
    })
    expect(state.capture()).toEqual({ prompt: "edited draft", attachments: [] })
  })

  test.each([
    ["/workspace/a #1.md", "file:///workspace/a%20%231.md"],
    ["C:\\workspace\\报告.txt", "file:///C:/workspace/%E6%8A%A5%E5%91%8A.txt"],
    ["\\\\server\\share\\a.txt", "file:////server/share/a.txt"],
  ])("encodes file URLs for %s", (path, expected) => expect(pathToFileUrl(path)).toBe(expected))
})
