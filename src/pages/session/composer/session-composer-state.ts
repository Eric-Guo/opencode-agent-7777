import { abortPrompt, submitPrompt } from "@/components/prompt-input/submit"
import { setState, type PromptAttachment } from "@/context/sync"

export function setPrompt(value: string) {
  setState("prompt", value)
}

export function addAttachment(attachment: PromptAttachment) {
  setState("attachments", (attachments) => [...attachments, attachment])
}

export function removeAttachment(id: string) {
  setState("attachments", (attachments) => attachments.filter((attachment) => attachment.id !== id))
}

export { abortPrompt, submitPrompt }
