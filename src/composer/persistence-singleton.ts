import { createPromptState } from "@/composer/state"
import { writePromptDraft } from "@/runtime/persistence/drafts"

export { createPromptState } from "@/composer/state"
export type { PromptAttachment, PromptDraft } from "@/composer/state"
export { clearPromptDraft, readPromptDraft, writePromptDraft } from "@/runtime/persistence/drafts"

// One composer draft is active at a time in 7777, so no routed prompt provider or session cache is needed.
export const prompt = createPromptState(undefined, writePromptDraft)

export const setPrompt = prompt.set
