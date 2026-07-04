import type { PromptAttachment } from "@/context/server-session"
import { uuid } from "@/utils/uuid"
import { attachmentMime } from "./files"

function dataUrl(file: File, mime: string) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.addEventListener("error", () => resolve(""))
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : ""
      const idx = value.indexOf(",")
      if (idx === -1) {
        resolve(value)
        return
      }
      resolve(`data:${mime};base64,${value.slice(idx + 1)}`)
    })
    reader.readAsDataURL(file)
  })
}

export async function createPromptAttachment(file: File): Promise<PromptAttachment | undefined> {
  const mime = await attachmentMime(file)
  if (!mime) return

  const url = await dataUrl(file, mime)
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
