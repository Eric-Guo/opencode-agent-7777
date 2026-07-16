import { setState, state } from "@/context/server-session-store"
import { writePromptDraft, type PromptAttachment } from "@/context/prompt-state-storage"

// Actions over the compact prompt fields; persistence remains in prompt-state-storage.ts.

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
