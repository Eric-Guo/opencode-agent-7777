import { afterEach, beforeEach, expect, test } from "bun:test"
import { SHOW_REASONING_SUMMARIES_KEY } from "@/constants/session"
import { FOLLOW_UP_BEHAVIOR_KEY } from "@/runtime/persistence/settings-storage-compact"
import { createSettings } from "./model"

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

test.each([undefined, "invalid", "null", "steer"])("uses Steer for an absent or invalid preference: %s", (value) => {
  if (value) saved.set(FOLLOW_UP_BEHAVIOR_KEY, value)
  expect(createSettings().general.followUpBehavior()).toBe("steer")
})

test("updates the current setting and restores it on reload", () => {
  const settings = createSettings()
  settings.general.setFollowUpBehavior("queue")
  expect(settings.general.followUpBehavior()).toBe("queue")
  expect(createSettings().general.followUpBehavior()).toBe("queue")
  settings.general.setFollowUpBehavior("steer")
  expect(createSettings().general.followUpBehavior()).toBe("steer")
})

test.each([undefined, "invalid", "false", "true"])("restores the existing reasoning preference: %s", (value) => {
  if (value) saved.set(SHOW_REASONING_SUMMARIES_KEY, value)
  expect(createSettings().general.showReasoningSummaries()).toBe(value === "true")
})

test("persists reasoning without resetting follow-up behavior or other settings instances", () => {
  const settings = createSettings()
  const other = createSettings()
  settings.general.setFollowUpBehavior("queue")
  settings.general.setShowReasoningSummaries(true)
  expect(settings.general.showReasoningSummaries()).toBe(true)
  expect(saved.get(SHOW_REASONING_SUMMARIES_KEY)).toBe("true")
  expect(createSettings().general.showReasoningSummaries()).toBe(true)
  expect(createSettings().general.followUpBehavior()).toBe("queue")
  expect(other.general.showReasoningSummaries()).toBe(false)
  expect(other.general.followUpBehavior()).toBe("steer")

  settings.general.setShowReasoningSummaries(false)
  expect(saved.get(SHOW_REASONING_SUMMARIES_KEY)).toBe("false")
  expect(createSettings().general.showReasoningSummaries()).toBe(false)
  expect(settings.general.followUpBehavior()).toBe("queue")
})

test("keeps the preference usable when storage reads and writes fail", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() {
        throw new Error("denied")
      },
      setItem() {
        throw new Error("quota")
      },
    },
  })
  const settings = createSettings()
  expect(settings.general.showReasoningSummaries()).toBe(false)
  expect(() => settings.general.setFollowUpBehavior("queue")).not.toThrow()
  expect(settings.general.followUpBehavior()).toBe("queue")
  expect(() => settings.general.setShowReasoningSummaries(true)).not.toThrow()
  expect(settings.general.showReasoningSummaries()).toBe(true)
})
