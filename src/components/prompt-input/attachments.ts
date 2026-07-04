import { onCleanup, onMount } from "solid-js"
import type { PromptAttachment } from "@/context/server-session"
import { uuid } from "@/utils/uuid"
import { attachmentMime } from "./files"
import { normalizePaste } from "./paste"

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

type PromptAttachmentsInput = {
  textarea: () => HTMLTextAreaElement | undefined
  value: () => string
  setValue: (value: string) => void
  addAttachment: (attachment: PromptAttachment) => void
  warn: () => void
  isDialogActive: () => boolean
  disabled?: () => boolean
  setDragging: (dragging: boolean) => void
  readClipboardImage?: () => Promise<File | null>
  getPathForFile?: (file: File) => string
}

export async function createPromptAttachment(
  file: File,
  input?: Pick<PromptAttachmentsInput, "getPathForFile">,
): Promise<PromptAttachment | undefined> {
  const mime = await attachmentMime(file)
  if (!mime) return

  const url = await dataUrl(file, mime)
  if (!url) return

  return {
    id: uuid(),
    filename: file.name,
    sourcePath: input?.getPathForFile?.(file) || undefined,
    mime,
    url,
  }
}

export async function createPromptAttachmentsFromFiles(
  files: File[],
  input?: Pick<PromptAttachmentsInput, "getPathForFile">,
) {
  const attachments: PromptAttachment[] = []
  let unsupported = false

  for (const file of files) {
    const attachment = await createPromptAttachment(file, input)
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

function clipboardFiles(event: ClipboardEvent) {
  return Array.from(event.clipboardData?.items ?? []).flatMap((item) => {
    if (item.kind !== "file") return []
    const file = item.getAsFile()
    return file ? [file] : []
  })
}

function insertText(input: PromptAttachmentsInput, text: string) {
  const textarea = input.textarea()
  const start = textarea?.selectionStart ?? input.value().length
  const end = textarea?.selectionEnd ?? start
  const next = `${input.value().slice(0, start)}${text}${input.value().slice(end)}`
  input.setValue(next)
  requestAnimationFrame(() => {
    if (!textarea) return
    const cursor = start + text.length
    textarea.focus()
    textarea.setSelectionRange(cursor, cursor)
  })
}

export function createPromptAttachments(input: PromptAttachmentsInput) {
  const addAttachments = async (files: File[], toast = true) => {
    if (input.disabled?.()) return false
    const result = await createPromptAttachmentsFromFiles(files, input)
    for (const attachment of result.attachments) input.addAttachment(attachment)
    if (result.unsupported && toast) input.warn()
    return result.attachments.length > 0
  }

  const addAttachment = (file: File) => addAttachments([file])

  const addClipboardAttachment = async (pending: Promise<File | null>) => {
    const file = await pending
    if (!file) return false
    return addAttachment(file)
  }

  const handlePaste = async (event: ClipboardEvent) => {
    if (input.disabled?.()) return
    const clipboardData = event.clipboardData
    if (!clipboardData) return

    const files = clipboardFiles(event)
    if (files.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      await addAttachments(files)
      return
    }

    const plainText = clipboardData.getData("text/plain") ?? ""
    if (input.readClipboardImage && !plainText) {
      event.preventDefault()
      event.stopPropagation()
      if (await addClipboardAttachment(input.readClipboardImage())) return
    }

    if (!plainText) return

    event.preventDefault()
    event.stopPropagation()
    insertText(input, normalizePaste(plainText))
  }

  const handleGlobalDragOver = (event: DragEvent) => {
    if (input.disabled?.()) return
    if (input.isDialogActive()) return
    const hasFiles = event.dataTransfer?.types.includes("Files")
    if (!hasFiles) return

    event.preventDefault()
    input.setDragging(true)
  }

  const handleGlobalDragLeave = (event: DragEvent) => {
    if (input.disabled?.()) return
    if (input.isDialogActive()) return
    if (!event.relatedTarget) input.setDragging(false)
  }

  const handleGlobalDrop = async (event: DragEvent) => {
    if (input.disabled?.()) return
    if (input.isDialogActive()) return
    const dropped = event.dataTransfer?.files
    if (!dropped || dropped.length === 0) return

    event.preventDefault()
    input.setDragging(false)
    await addAttachments(Array.from(dropped))
  }

  onMount(() => {
    document.addEventListener("dragover", handleGlobalDragOver)
    document.addEventListener("dragleave", handleGlobalDragLeave)
    document.addEventListener("drop", handleGlobalDrop)
    onCleanup(() => {
      document.removeEventListener("dragover", handleGlobalDragOver)
      document.removeEventListener("dragleave", handleGlobalDragLeave)
      document.removeEventListener("drop", handleGlobalDrop)
    })
  })

  return {
    addAttachment,
    addAttachments,
    addClipboardAttachment,
    handlePaste,
  }
}
