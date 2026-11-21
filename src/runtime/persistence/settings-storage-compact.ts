import { SHOW_REASONING_SUMMARIES_KEY } from "@/constants/session"
import type { ComposerDelivery } from "@/composer/adapter"
import { storageGet, storageSet } from "./storage"

// Local preferences for the embedded app's smaller settings surface.
export const FOLLOW_UP_BEHAVIOR_KEY = "opencode.7777.followUpBehavior"

function booleanPreference(key: string, defaultValue: boolean) {
  return {
    read() {
      const value = storageGet(key)
      if (value === "true") return true
      if (value === "false") return false
      return defaultValue
    },
    write: (value: boolean) => storageSet(key, String(value)),
  }
}

export const { read: readShowReasoningSummaries, write: writeShowReasoningSummaries } = booleanPreference(
  SHOW_REASONING_SUMMARIES_KEY,
  false,
)
export const { read: readShowTurnDiffs, write: writeShowTurnDiffs } = booleanPreference(
  "opencode.7777.showTurnDiffs",
  true,
)

export function readFollowUpBehavior(): ComposerDelivery {
  return storageGet(FOLLOW_UP_BEHAVIOR_KEY) === "queue" ? "queue" : "steer"
}

export function writeFollowUpBehavior(value: ComposerDelivery) {
  storageSet(FOLLOW_UP_BEHAVIOR_KEY, value)
}
