import { afterEach, beforeEach, expect, test } from "bun:test"
import { createComposerHistory } from "@/composer/history/store"
import { translateSync } from "@/runtime/i18n/language"
import { readModelConfig, writeModelConfig } from "@/runtime/server/persistence"
import { createSettings } from "@/settings/model"
import { clearPromptDraft, readPromptDraft, writePromptDraft } from "./drafts"
import { readSessionRecord } from "./storage-compact"

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
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
  if (original) Object.defineProperty(globalThis, "localStorage", original)
  else delete (globalThis as { localStorage?: Storage }).localStorage
})

test.each(["missing", "getter", "operations"])("consumers remain usable with %s storage", (mode) => {
  const fail = () => {
    throw new Error("Storage unavailable")
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    ...(mode === "getter"
      ? { get: fail }
      : { value: mode === "missing" ? undefined : { getItem: fail, setItem: fail, removeItem: fail } }),
  })

  expect(readPromptDraft()).toBeUndefined()
  expect(readSessionRecord()).toBeUndefined()
  expect(() => writePromptDraft({ prompt: "draft", attachments: [] })).not.toThrow()
  expect(() => clearPromptDraft()).not.toThrow()
  expect(() => writeModelConfig(readModelConfig())).not.toThrow()
  expect(() => translateSync("error.requestFailed")).not.toThrow()

  const settings = createSettings()
  settings.general.setFollowUpBehavior("queue")
  settings.general.setShowReasoningSummaries(true)
  expect(settings.general.followUpBehavior()).toBe("queue")
  expect(settings.general.showReasoningSummaries()).toBe(true)

  const history = createComposerHistory()
  history.add([{ type: "text", content: "remember", start: 0, end: 8 }], "normal")
  expect(history.entries("normal")).toEqual([
    { prompt: [{ type: "text", content: "remember", start: 0, end: 8 }] },
  ])
})

test.each(["zh", '{"locale":"zh-CN"}'])("keeps plain and legacy locale preferences: %s", (value) => {
  saved.set("opencode.7777.language", value)
  expect(translateSync("error.requestFailed")).toBe("请求失败")
  saved.set("opencode.7777.language", "en")
  expect(translateSync("error.requestFailed")).toBe("Request failed")
})

test("a failed write preserves other records and later writes can recover", () => {
  saved.set("opencode.7777.language", "en")
  saved.set("other.draft", JSON.stringify({ prompt: "other agent", attachments: [] }))
  const write = localStorage.setItem
  localStorage.setItem = () => {
    throw new Error("Quota exceeded")
  }
  writePromptDraft({ prompt: "unsaved", attachments: [] })
  expect(readPromptDraft()).toBeUndefined()
  expect(readPromptDraft("other.draft")).toEqual({ prompt: "other agent", attachments: [] })

  localStorage.setItem = write
  writePromptDraft({ prompt: "recovered", attachments: [] })
  expect(readPromptDraft()).toEqual({ prompt: "recovered", attachments: [] })
  clearPromptDraft()
  expect(readPromptDraft()).toBeUndefined()
  expect(readPromptDraft("other.draft")).toEqual({ prompt: "other agent", attachments: [] })
  expect(saved.get("opencode.7777.language")).toBe("en")
})
