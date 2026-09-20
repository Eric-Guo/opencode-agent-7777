import { afterEach, beforeEach, expect, test } from "bun:test"
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
  else Reflect.deleteProperty(globalThis, "localStorage")
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
  expect(() => settings.general.setFollowUpBehavior("queue")).not.toThrow()
  expect(settings.general.followUpBehavior()).toBe("queue")
})
