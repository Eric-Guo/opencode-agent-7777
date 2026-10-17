import { onCleanup, onMount } from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createBlobReference } from "@/runtime/persistence/drafts"
import { uuid } from "@/runtime/persistence/uuid"
import { ACCEPTED_FILE_TYPES, attachmentMime } from "@/runtime/platform/file-picker"
import type { ComposerAttachment, ComposerPrompt } from "../types"
import { isAttachment } from "../prompt-parts"
import { getCursorPosition } from "../editor/dom"

type PromptTarget = {
  current: () => ComposerPrompt
  cursor: () => number | undefined
  set: (prompt: ComposerPrompt, cursor?: number) => void
}

export type ComposerAttachmentConfig = {
  picker?: (
    options: { defaultPath?: string; multiple?: boolean; accept?: string[] },
    onFile: (file: File) => Promise<unknown>,
  ) => Promise<void>
  directory: () => string
  isDialogActive: () => boolean
  warn: () => void
  duplicate: () => void
  onError: (error: unknown) => void
  readClipboardImage?: () => Promise<File | null>
  getPathForFile?: (file: File) => string
  onDragCancel?: (callback: () => void) => () => void
  dropTarget?: () => HTMLElement | undefined
  store?: (file: File) => Promise<{ id: string; url: string }>
}

export function createComposerAttachments(
  input: ComposerAttachmentConfig & {
    capture: () => PromptTarget
    editor: () => HTMLElement | undefined
    focusEditor: () => void
    addPart: (part: ComposerPrompt[number]) => boolean
    setDraggingType: (type: "image" | "@mention" | null) => void
  },
) {
  const clearDrag = () => {
    input.setDraggingType(null)
  }
  const contains = (target: EventTarget | null) =>
    !input.dropTarget || (!!target && !!input.dropTarget()?.contains(target as Node))
  const handleDragOver = (event: DragEvent) => {
    if (input.isDialogActive() || !contains(event.target)) return
    if (!event.dataTransfer?.types.includes("Files")) return
    event.preventDefault()
    input.setDraggingType("image")
  }
  const handleDragLeave = (event: DragEvent) => {
    if (!event.relatedTarget || !contains(event.relatedTarget)) clearDrag()
  }
  const capture = () => {
    const prompt = input.capture()
    const editor = input.editor()
    if (!editor) return
    return { prompt, cursor: prompt.cursor() ?? getCursorPosition(editor, "start") }
  }
  const add = async (file: File, toast = true, target = capture(), clipboard = false) => {
    if (!target) return false
    const mime = await attachmentMime(file)
    if (!mime) {
      if (toast) input.warn()
      return false
    }
    const blob = input.store ? await input.store(file) : await createBlobReference(file)
    const sourcePath = input.getPathForFile?.(file) || undefined
    // Native clipboard images arrive with a fresh timestamped filename on every paste, so identical
    // clipboard content is matched on bytes alone.
    const duplicate = target.prompt
      .current()
      .some(
        (part) =>
          isAttachment(part) &&
          part.blob.id === blob.id &&
          (sourcePath
            ? part.sourcePath === sourcePath
            : !part.sourcePath && (clipboard || part.filename === file.name)),
      )
    if (duplicate) {
      input.duplicate()
      return true
    }
    const attachment: ComposerAttachment = {
      type: "image",
      id: uuid(),
      filename: file.name,
      sourcePath,
      mime,
      blob,
    }
    target.prompt.set([...target.prompt.current(), attachment], target.cursor)
    return true
  }
  const addAttachments = async (files: File[], toast = true, target = capture()) => {
    const found = await files.reduce(async (result, file) => {
      const previous = await result
      return (await add(file, false, target)) || previous
    }, Promise.resolve(false))
    if (!found && files.length > 0 && toast) input.warn()
    return found
  }
  const handlePaste = async (event: ClipboardEvent) => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return
    const target = capture()
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    const files = Array.from(clipboardData.items).flatMap((item) => {
      if (item.kind !== "file") return []
      const file = item.getAsFile()
      return file ? [file] : []
    })
    if (files.length > 0) {
      await addAttachments(files, true, target)
      return
    }
    const plainText = clipboardData.getData("text/plain") ?? ""
    if (input.readClipboardImage && !plainText) {
      const file = await input.readClipboardImage()
      if (file && (await add(file, true, target, true))) return
    }
    if (!plainText) return
    const text = plainText.includes("\r") ? plainText.replace(/\r\n?/g, "\n") : plainText
    const put = () => {
      if (input.addPart({ type: "text", content: text, start: 0, end: 0 })) return true
      input.focusEditor()
      return input.addPart({ type: "text", content: text, start: 0, end: 0 })
    }
    if (text.includes("\n") || largePaste(text)) {
      put()
      return
    }
    if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) return
    put()
  }
  const handleDrop = async (event: DragEvent) => {
    clearDrag()
    if (input.isDialogActive() || !contains(event.target)) return
    const plainText = event.dataTransfer?.getData("text/plain")
    if (plainText?.startsWith("file:")) {
      event.preventDefault()
      const path = plainText.slice("file:".length)
      input.focusEditor()
      input.addPart({ type: "file", path, content: `@${path}`, start: 0, end: 0 })
      return
    }
    const files = event.dataTransfer?.files
    if (!files?.length) return
    event.preventDefault()
    await addAttachments(Array.from(files))
  }

  // All attachment entry points report failures through the same composer error surface.
  const run = async <T>(action: () => Promise<T>) => {
    try {
      return await action()
    } catch (error) {
      input.onError(error)
    }
  }

  onMount(() => {
    const cancel = input.onDragCancel?.(clearDrag)
    if (cancel) onCleanup(cancel)
    const target = input.dropTarget ? input.dropTarget() : document
    if (!target) return
    makeEventListener(target, "dragover", handleDragOver)
    makeEventListener(target, "dragleave", handleDragLeave)
    makeEventListener(document, "keydown", (event) => {
      if (event.key === "Escape") clearDrag()
    })
    makeEventListener(document, "dragend", clearDrag)
    makeEventListener(window, "blur", clearDrag)
    makeEventListener(target, "drop", (event) => void run(() => handleDrop(event)))
  })

  return {
    addAttachments: (...args: Parameters<typeof addAttachments>) => run(() => addAttachments(...args)),
    handlePaste: (event: ClipboardEvent) => run(() => handlePaste(event)),
    handleDrop: (event: DragEvent) => run(() => handleDrop(event)),
    handleDragOver,
    handleDragLeave,
    pick(fallback: () => void, done?: () => void) {
      if (!input.picker) {
        fallback()
        return
      }
      return run(async () => {
        await input.picker!(
          { defaultPath: input.directory(), multiple: true, accept: [...ACCEPTED_FILE_TYPES] },
          (file) => add(file),
        )
        done?.()
      })
    },
  }
}

function largePaste(text: string) {
  if (text.length >= 8000) return true
  return text.split("\n").length - 1 >= 120
}
