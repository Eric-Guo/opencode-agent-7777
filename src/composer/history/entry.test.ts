import { expect, test } from "bun:test"
import { createStore, produce } from "solid-js/store"
import {
  limitHistoryEntries,
  MAX_HISTORY,
  MAX_HISTORY_CHARS,
  prependHistoryEntry,
  type PromptHistoryEntry,
} from "./entry"

function entry(content: string): PromptHistoryEntry {
  return { prompt: [{ type: "text", content, start: 0, end: content.length }] }
}

test("ignores empty prompts and adjacent duplicates, preserves significant whitespace", () => {
  const empty: PromptHistoryEntry[] = []
  expect(prependHistoryEntry(empty, entry("  ").prompt)).toBe(empty)
  const entries = prependHistoryEntry(empty, entry(" one ").prompt)
  expect(prependHistoryEntry(entries, entry(" one ").prompt)).toBe(entries)
  expect(prependHistoryEntry(entries, entry("one").prompt)).toEqual([entry("one"), entry(" one ")])
})

test("history captures attachment-only prompts without sharing Solid draft objects", () => {
  const [draft, setDraft] = createStore<PromptHistoryEntry>({
    prompt: [
      {
        type: "image",
        id: "file",
        filename: "a.png",
        mime: "image/png",
        blob: { id: "blob", url: "data:image/png;base64,YQ==" },
      },
    ],
  })
  const saved = prependHistoryEntry([], draft.prompt)
  setDraft(
    produce((state) => {
      const part = state.prompt[0]
      if (part.type !== "image") throw new Error("Expected an attachment")
      part.blob.url = "data:image/png;base64,Yg=="
      part.filename = "b.png"
    }),
  )
  expect(saved).toEqual([
    {
      prompt: [
        { type: "text", content: "", start: 0, end: 0 },
        {
          type: "image",
          id: "file",
          filename: "a.png",
          mime: "image/png",
          blob: { id: "blob", url: "data:image/png;base64,YQ==" },
        },
      ],
    },
  ])
})

test("bounds history count and serialized size, retaining usable older entries after an oversized prompt", () => {
  let entries: PromptHistoryEntry[] = []
  for (let index = 0; index <= MAX_HISTORY; index++) entries = prependHistoryEntry(entries, entry(String(index)).prompt)
  expect(entries).toHaveLength(MAX_HISTORY)
  expect(entries[0]).toEqual(entry("100"))
  expect(entries.at(-1)).toEqual(entry("1"))
  const oversized = entry("x".repeat(MAX_HISTORY_CHARS))
  expect(limitHistoryEntries([oversized, entry("keep")])).toEqual([entry("keep")])
  const large = Array.from({ length: 20 }, (_, index) => entry(`${index}${"x".repeat(100_000)}`))
  const bounded = limitHistoryEntries(large)
  expect(bounded.length).toBeGreaterThan(0)
  expect(bounded.length).toBeLessThan(large.length)
  expect(JSON.stringify({ entries: bounded }).length).toBeLessThanOrEqual(MAX_HISTORY_CHARS)
})
