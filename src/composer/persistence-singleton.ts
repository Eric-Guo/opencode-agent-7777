import { createPromptState } from "@/composer/state"
import { writePromptDraft } from "@/runtime/persistence/drafts"
import { state } from "@/runtime/server/session-store-compact"

export { createPromptState } from "@/composer/state"
export type { PromptAttachment, PromptDraft } from "@/composer/state"
export { clearPromptDraft, readPromptDraft, writePromptDraft } from "@/runtime/persistence/drafts"

// One composer draft is active at a time in 7777, so no routed prompt provider or session cache is needed.
export const prompt = createPromptState(undefined, (draft) => {
  // Desktop supplies the tab's keys asynchronously; never write to fallback keys while it is still loading.
  if (!state.server) return
  writePromptDraft(draft, state.server.storageKeys?.promptDraft)
})

export const setPrompt = prompt.set
