import { SHOW_REASONING_SUMMARIES_KEY, SHOW_TOOLS_PART_KEY } from "@/constants/session"

function storageGet(key: string) {
  if (typeof localStorage !== "object") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

export function readShowReasoningSummaries() {
  return storageGet(SHOW_REASONING_SUMMARIES_KEY) === "true"
}

export function writeShowReasoningSummaries(value: boolean) {
  storageSet(SHOW_REASONING_SUMMARIES_KEY, value ? "true" : "false")
}

export function readShowToolsPart() {
  return storageGet(SHOW_TOOLS_PART_KEY) === "true"
}

export function writeShowToolsPart(value: boolean) {
  storageSet(SHOW_TOOLS_PART_KEY, value ? "true" : "false")
}
