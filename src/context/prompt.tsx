import { setState, state } from "@/context/server-session"
import { writePromptDraft, type PromptAttachment } from "@/context/prompt-state"

export { clearPromptDraft, readPromptDraft, writePromptDraft } from "@/context/prompt-state"
export type { PromptAttachment, PromptDraft } from "@/context/prompt-state"

export function setPrompt(value: string) {
  setState("prompt", value)
  writePromptDraft({ prompt: value, attachments: state.attachments })
}

export function addAttachment(attachment: PromptAttachment) {
  const attachments = [...state.attachments, attachment]
  setState("attachments", attachments)
  writePromptDraft({ prompt: state.prompt, attachments })
}

export function removeAttachment(id: string) {
  const attachments = state.attachments.filter((attachment) => attachment.id !== id)
  setState("attachments", attachments)
  writePromptDraft({ prompt: state.prompt, attachments })
}
