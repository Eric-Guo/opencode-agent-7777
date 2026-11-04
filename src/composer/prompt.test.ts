import { describe, expect, test } from "bun:test"
import { promptFromDraft } from "./prompt"
import type { PromptDraft } from "./schema"
import { createPromptState } from "./state"

describe("promptFromDraft", () => {
  test.each([
    [-1, 4],
    [0.5, 4],
    [0, 4.5],
    [0, 0],
    [0, NaN],
    [0, Infinity],
    [0, 3],
    [1, 5],
  ])("skips invalid draft ranges %s..%s without relocating the mention", (start, end) => {
    expect(
      promptFromDraft({
        prompt: "@one @two",
        attachments: [],
        references: [
          { type: "agent", name: "one", content: "@one", start, end },
          { type: "agent", name: "two", content: "@two", start: 5, end: 9 },
        ],
      }),
    ).toEqual([
      { type: "text", content: "@one ", start: 0, end: 5 },
      { type: "agent", name: "two", content: "@two", start: 5, end: 9 },
    ])
  })

  test("preserves stored order for overlapping draft ties and isolates restored references", () => {
    const draft: PromptDraft = {
      prompt: "@a-b @c",
      attachments: [],
      references: [
        { type: "agent", name: "c", content: "@c", start: 5, end: 7 },
        { type: "agent", name: "a-b", content: "@a-b", start: 0, end: 4 },
        { type: "agent", name: "a", content: "@a", start: 0, end: 2 },
      ],
    }
    const state = createPromptState(draft)
    expect(state.capture()).toEqual({
      prompt: "@a-b @c",
      attachments: [],
      references: [
        { type: "agent", name: "a-b", content: "@a-b", start: 0, end: 4 },
        { type: "agent", name: "c", content: "@c", start: 5, end: 7 },
      ],
    })
    state.store[1]("prompt", 0, { type: "agent", content: "changed" })
    expect(draft.references).toEqual([
      { type: "agent", name: "c", content: "@c", start: 5, end: 7 },
      { type: "agent", name: "a-b", content: "@a-b", start: 0, end: 4 },
      { type: "agent", name: "a", content: "@a", start: 0, end: 2 },
    ])
  })
})
