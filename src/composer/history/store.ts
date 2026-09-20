import { Option, Schema } from "effect"
import { createStore } from "solid-js/store"
import { PromptHistoryState } from "../schema"
import type { ComposerHistory } from "../types"
import { cloneHistoryEntry, limitHistoryEntries, prependHistoryEntry } from "./entry"

export const PROMPT_HISTORY_KEY = "opencode.7777.prompt.history"
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(PromptHistoryState))

export function createComposerHistory(): ComposerHistory {
  const read = () => {
    try {
      const decoded = decode(localStorage.getItem(PROMPT_HISTORY_KEY))
      return Option.isSome(decoded) ? limitHistoryEntries(decoded.value.entries) : []
    } catch {
      return []
    }
  }
  const [store, setStore] = createStore({ entries: read() })
  return {
    // Clone at the editor boundary: a Solid draft may mutate nested attachment references in place.
    entries: (mode) => (mode === "normal" ? store.entries.map(cloneHistoryEntry) : []),
    add(prompt, mode) {
      if (mode !== "normal") return
      const entries = prependHistoryEntry(store.entries, prompt)
      if (entries === store.entries) return
      setStore("entries", entries)
      try {
        localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify({ entries }))
      } catch {
        // Storage may be full or unavailable; recall remains usable for this page's lifetime.
      }
    },
  }
}

export const composerHistory = createComposerHistory()
