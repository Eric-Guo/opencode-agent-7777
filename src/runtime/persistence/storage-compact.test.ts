import { afterEach, beforeEach, expect, test } from "bun:test"
import { AGENT_DEFAULT_CONFIG } from "@/new-session/agent-default-config"
import { readSessionRecord, writeSessionRecord } from "./storage-compact"

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const saved = new Map<string, string>()

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

test("configured session keys preserve default and legacy data and isolate another agent", () => {
  saved.set("opencode.7777.session.id", "legacy-session")
  saved.set("opencode.7777.session.directory", "/legacy")
  saved.set(AGENT_DEFAULT_CONFIG.storageKeys.sessionID, "default-session")
  saved.set(AGENT_DEFAULT_CONFIG.storageKeys.sessionDirectory, "/default")
  expect(readSessionRecord()).toEqual({ id: "default-session", directory: "/default" })
  const keys = { sessionID: "other.session", sessionDirectory: "other.directory", promptDraft: "other.draft" }
  expect(readSessionRecord(keys)).toBeUndefined()
  writeSessionRecord(
    {
      id: "other-session",
      projectID: "project",
      location: { directory: "/other" },
      title: "Other session",
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 1 },
    },
    keys,
  )
  expect(readSessionRecord(keys)).toEqual({ id: "other-session", directory: "/other" })
  expect(saved.get("other.session")).toBe("other-session")
  expect(saved.get("other.directory")).toBe("/other")
  expect(readSessionRecord()).toEqual({ id: "default-session", directory: "/default" })
  expect(saved.get("opencode.7777.session.id")).toBe("legacy-session")
  expect(saved.get("opencode.7777.session.directory")).toBe("/legacy")
})
