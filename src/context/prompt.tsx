import { abortPrompt, submitPrompt } from "@/components/prompt-input/submit"
import { writePromptDraft } from "@/context/local"
import { setState, state, type PromptAttachment } from "@/context/server-session"

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

export { abortPrompt, submitPrompt }
