import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { clearPromptDraft, readPromptDraft, writePromptDraft } from "./drafts"
import { AGENT_DEFAULT_CONFIG } from "@/new-session/agent-default-config"

const draftKey = AGENT_DEFAULT_CONFIG.storageKeys.promptDraft
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
  else delete (globalThis as { localStorage?: typeof globalThis.localStorage }).localStorage
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
    expect(saved.get(draftKey)).toBe(JSON.stringify(draft))
    expect(readPromptDraft()).toEqual(draft)
    clearPromptDraft()
    expect(saved.has(draftKey)).toBe(false)
  })

  test("recovers a usable partial draft and only removes the key when nothing survives", () => {
    saved.set(draftKey, JSON.stringify({ prompt: "keep me", attachments: [null] }))
    expect(readPromptDraft()).toEqual({ prompt: "keep me", attachments: [] })
    expect(saved.has(draftKey)).toBe(true)
    writePromptDraft({ prompt: "", attachments: [] })
    expect(readPromptDraft()).toBeUndefined()
    expect(saved.has(draftKey)).toBe(false)
  })

  test.each(["{", "null", "false", "[]", "{}", '{"prompt":42,"attachments":[null]}'])(
    "removes malformed or empty saved drafts: %s",
    (value) => {
      saved.set(draftKey, value)
      expect(readPromptDraft()).toBeUndefined()
      expect(saved.has(draftKey)).toBe(false)
    },
  )

  test("configured drafts do not read, replace, or clear another agent's saved draft", () => {
    writePromptDraft({ prompt: "existing 7777 draft", attachments: [] })
    expect(readPromptDraft("other.draft")).toBeUndefined()
    writePromptDraft({ prompt: "other agent draft", attachments: [] }, "other.draft")
    expect(readPromptDraft("other.draft")).toEqual({ prompt: "other agent draft", attachments: [] })
    clearPromptDraft("other.draft")
    expect(saved.has("other.draft")).toBe(false)
    expect(readPromptDraft()).toEqual({ prompt: "existing 7777 draft", attachments: [] })
    saved.set("other.draft", "broken")
    expect(readPromptDraft("other.draft")).toBeUndefined()
    expect(saved.has("other.draft")).toBe(false)
    expect(saved.has(draftKey)).toBe(true)
  })

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
