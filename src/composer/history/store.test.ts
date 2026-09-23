import { afterEach, beforeEach, expect, test } from "bun:test"
import { createStore, produce } from "solid-js/store"
import type { ComposerHistoryEntry, ComposerPrompt } from "../types"
import { createComposerHistory, PROMPT_HISTORY_KEY } from "./store"

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const saved = new Map<string, string>()
const text = (content: string): ComposerPrompt => [{ type: "text", content, start: 0, end: content.length }]

beforeEach(() => {
  saved.clear()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  })
})
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original)
  else delete (globalThis as { localStorage?: typeof globalThis.localStorage }).localStorage
})

test("round-trips text and attachments and isolates restored editor stores", () => {
  const history = createComposerHistory()
  const prompt: ComposerPrompt = [
    ...text("saved"),
    {
      type: "image",
      id: "file",
      filename: "a.png",
      mime: "image/png",
      blob: { id: "blob", url: "data:image/png;base64,YQ==" },
    },
  ]
  history.add(prompt, "normal")
  const restored = createComposerHistory()
  const [draft, setDraft] = createStore<ComposerHistoryEntry>(restored.entries("normal")[0])
  setDraft(
    produce((state) => {
      const text = state.prompt[0]
      const image = state.prompt[1]
      if (text.type !== "text" || image.type !== "image") throw new Error("Expected text and attachment")
      text.content = "edited"
      image.blob.url = "data:image/png;base64,Yg=="
    }),
  )
  expect(draft.prompt[0]).toMatchObject({ content: "edited" })
  expect(restored.entries("normal")).toEqual([{ prompt }])
  expect(prompt[1]).toMatchObject({ blob: { id: "blob", url: "data:image/png;base64,YQ==" } })
  expect(createComposerHistory().entries("normal")).toEqual([{ prompt }])
  expect(restored.entries("shell")).toEqual([])
})

test("recovers valid entries around corrupt persisted values without partial attachments", () => {
  saved.set(
    PROMPT_HISTORY_KEY,
    JSON.stringify({
      entries: [
        null,
        { prompt: text("valid") },
        { prompt: [{ type: "image", blob: {} }] },
        { prompt: [{ type: "text", content: 4 }] },
        {
          prompt: [
            {
              type: "image",
              id: "unsafe",
              filename: "a",
              mime: "image/png",
              blob: { id: "remote", url: "https://example.com/image" },
            },
          ],
        },
      ],
    }),
  )
  expect(createComposerHistory().entries("normal")).toEqual([{ prompt: text("valid") }])
})

test.each(["broken", "null", "[]", '{"entries":42}'])("tolerates malformed history: %s", (value) => {
  saved.set(PROMPT_HISTORY_KEY, value)
  const history = createComposerHistory()
  expect(history.entries("normal")).toEqual([])
  history.add(text("new"), "normal")
  expect(createComposerHistory().entries("normal")).toEqual([{ prompt: text("new") }])
})

test("storage denial does not block in-memory recall or sending", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage denied")
    },
  })
  const history = createComposerHistory()
  expect(() => history.add(text("new"), "normal")).not.toThrow()
  expect(history.entries("normal")).toEqual([{ prompt: text("new") }])
})
