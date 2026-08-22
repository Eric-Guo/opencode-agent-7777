import { createPromptState, writePromptDraft } from "@/composer/state-compact"

export { clearPromptDraft, createPromptState, readPromptDraft, writePromptDraft } from "@/composer/state-compact"
export type { PromptAttachment, PromptDraft } from "@/composer/state-compact"

// One composer draft is active at a time in 7777, so no routed prompt provider or session cache is needed.
export const prompt = createPromptState(undefined, writePromptDraft)

export const setPrompt = prompt.set
