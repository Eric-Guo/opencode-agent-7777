import type { PromptAttachment } from "@/context/sync"
import { uuid } from "@/utils/uuid"
import { attachmentMime, fileDataUrl } from "./files"

export async function createPromptAttachment(file: File): Promise<PromptAttachment | undefined> {
  const mime = await attachmentMime(file)
  if (!mime) return

  const url = await fileDataUrl(file, mime)
  if (!url) return

  return {
    id: uuid(),
    filename: file.name,
    mime,
    url,
  }
}

export async function createPromptAttachments(files: File[]) {
  const attachments: PromptAttachment[] = []
  let unsupported = false

  for (const file of files) {
    const attachment = await createPromptAttachment(file)
    if (attachment) {
      attachments.push(attachment)
      continue
    }
    unsupported = true
  }

  return {
    attachments,
    unsupported,
  }
}
