import { createPromptState, writePromptDraft } from "@/context/prompt-state"

export { clearPromptDraft, createPromptState, readPromptDraft, writePromptDraft } from "@/context/prompt-state"
export type { PromptAttachment, PromptDraft } from "@/context/prompt-state"

// One composer draft is active at a time in 7777, so no routed prompt provider or session cache is needed.
export const prompt = createPromptState(undefined, writePromptDraft)

export const setPrompt = prompt.set
export const addAttachment = prompt.addAttachment
export const removeAttachment = prompt.removeAttachment
