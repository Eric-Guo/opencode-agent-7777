import { SHOW_REASONING_SUMMARIES_KEY } from "@/constants/session"
import type { ComposerDelivery } from "@/composer/adapter"
import { storageGet, storageSet } from "./storage"

// Local preferences for the embedded app's smaller settings surface.
export const FOLLOW_UP_BEHAVIOR_KEY = "opencode.7777.followUpBehavior"

export function readShowReasoningSummaries() {
  return storageGet(SHOW_REASONING_SUMMARIES_KEY) === "true"
}

export function writeShowReasoningSummaries(value: boolean) {
  storageSet(SHOW_REASONING_SUMMARIES_KEY, value ? "true" : "false")
}

export function readFollowUpBehavior(): ComposerDelivery {
  return storageGet(FOLLOW_UP_BEHAVIOR_KEY) === "queue" ? "queue" : "steer"
}

export function writeFollowUpBehavior(value: ComposerDelivery) {
  storageSet(FOLLOW_UP_BEHAVIOR_KEY, value)
}
