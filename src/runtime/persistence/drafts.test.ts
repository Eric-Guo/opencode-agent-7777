import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { PROMPT_DRAFT_KEY } from "@/constants/session"
import { clearPromptDraft, readPromptDraft, writePromptDraft } from "./drafts"

const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const saved = new Map<string, string>()

beforeEach(() => {
  saved.clear()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    },
  })
})

afterEach(() => {
  if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor)
  else Reflect.deleteProperty(globalThis, "localStorage")
})

describe("single-draft persistence", () => {
  test("reads and writes the existing storage key and data-URL attachment format", () => {
    const draft = {
      prompt: "  explain this\n",
      attachments: [
        { id: "image", filename: "image.png", mime: "image/png", url: "data:image/png;base64,YQ==", blobID: "hash" },
      ],
    }
    writePromptDraft(draft)
    expect(saved.get(PROMPT_DRAFT_KEY)).toBe(JSON.stringify(draft))
    expect(readPromptDraft()).toEqual(draft)
    clearPromptDraft()
    expect(saved.has(PROMPT_DRAFT_KEY)).toBe(false)
  })

  test("recovers a usable partial draft and only removes the key when nothing survives", () => {
    saved.set(PROMPT_DRAFT_KEY, JSON.stringify({ prompt: "keep me", attachments: [null] }))
    expect(readPromptDraft()).toEqual({ prompt: "keep me", attachments: [] })
    expect(saved.has(PROMPT_DRAFT_KEY)).toBe(true)
    writePromptDraft({ prompt: "", attachments: [] })
    expect(readPromptDraft()).toBeUndefined()
    expect(saved.has(PROMPT_DRAFT_KEY)).toBe(false)
  })

  test.each(["{", "null", "false", "[]", "{}", '{"prompt":42,"attachments":[null]}'])(
    "removes malformed or empty saved drafts: %s",
    (value) => {
      saved.set(PROMPT_DRAFT_KEY, value)
      expect(readPromptDraft()).toBeUndefined()
      expect(saved.has(PROMPT_DRAFT_KEY)).toBe(false)
    },
  )

  test("continues when storage is unavailable or denies access", () => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined })
    expect(readPromptDraft()).toBeUndefined()
    expect(() => writePromptDraft({ prompt: "hello", attachments: [] })).not.toThrow()
    expect(() => clearPromptDraft()).not.toThrow()

    const denied = () => {
      throw new Error("Storage unavailable")
    }
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: denied, setItem: denied, removeItem: denied },
    })
    expect(readPromptDraft()).toBeUndefined()
    expect(() => writePromptDraft({ prompt: "hello", attachments: [] })).not.toThrow()
    expect(() => clearPromptDraft()).not.toThrow()
  })
})
