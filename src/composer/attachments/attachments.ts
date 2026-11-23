import { onCleanup, onMount } from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { uuid } from "@opencode/util/uuid"
import { createBlobReference, sameBlobContent } from "@/runtime/persistence/drafts"
import { ACCEPTED_FILE_TYPES, attachmentMime, type AttachmentPickerLifecycle } from "@/runtime/platform/file-picker"
import type { ComposerAttachment, ComposerPrompt } from "../types"
import { isAttachment } from "../prompt-parts"
import { clipboardText, getCursorPosition, insertComposerText } from "../editor/dom"
import { createAttachmentPreparation, type AttachmentOperation } from "./preparation"

type PromptTarget = {
  current: () => ComposerPrompt
  cursor: () => number | undefined
  set: (prompt: ComposerPrompt, cursor?: number) => void
}

export type ComposerAttachmentConfig = {
  picker?: (
    options: { defaultPath?: string; multiple?: boolean; accept?: string[] },
    onFile: (file: File) => Promise<unknown>,
    lifecycle?: AttachmentPickerLifecycle,
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
  scope?: () => unknown
  store?: (file: File, signal?: AbortSignal) => Promise<{ id: string; url: string }>
}

export function createComposerAttachments(
  input: ComposerAttachmentConfig & {
    capture: () => PromptTarget
    identity?: () => unknown
    editor: () => HTMLElement | undefined
    focusEditor: () => void
    addPart: (part: ComposerPrompt[number]) => boolean
    setDraggingType: (type: "image" | "@mention" | null) => void
  },
) {
  const preparation = createAttachmentPreparation({
    owner: () => ({ scope: input.scope?.(), identity: input.identity?.() }),
    onError: input.onError,
  })
  type Work = { operation: AttachmentOperation; target: { prompt: PromptTarget; cursor: number | undefined } }
  // This callback registration survives retirement so a late native input event is consumed, not retargeted.
  let browserChoice: Work | undefined
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
  const begin = (phase: "choosing" | "preparing", target = capture(), done?: () => void): Work | undefined => {
    if (!target) return
    const editor = input.editor()
    const operation = preparation.start(phase, () => input.editor() === editor && editor?.isConnected !== false, done)
    return operation ? { operation, target } : undefined
  }
  const add = async (file: File, work: Work, toast = true, clipboard = false) => {
    const { operation, target } = work
    if (!operation.current()) return false
    const mime = await attachmentMime(file)
    if (!operation.current()) return false
    if (!mime) {
      if (toast) input.warn()
      operation.progress()
      return false
    }
    const blob = await (input.store ?? createBlobReference)(file, operation.signal)
    if (!operation.current()) return false
    const sourcePath = input.getPathForFile?.(file) || undefined
    // Native clipboard images arrive with a fresh timestamped filename on every paste, so identical
    // clipboard content is matched on bytes alone.
    if (!operation.current()) return false
    const duplicate = target.prompt
      .current()
      .some(
        (part) =>
          isAttachment(part) &&
          (sourcePath
            ? (part.sourcePath ?? part.filename) === sourcePath
            : !part.sourcePath && (clipboard || part.filename === file.name)) &&
          sameBlobContent(part.blob, blob),
      )
    if (duplicate) {
      input.duplicate()
      operation.progress()
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
    // Keep edits made while bytes were being read, including their latest caret position.
    target.prompt.set([...target.prompt.current(), attachment], target.prompt.cursor() ?? target.cursor)
    operation.progress()
    return true
  }
  const batch = async (files: File[], work: Work, toast = true) => {
    let found = false
    for (const file of files) {
      if (!work.operation.current()) return found
      found = (await add(file, work, false)) || found
    }
    if (work.operation.current() && !found && files.length > 0 && toast) input.warn()
    return found
  }
  const run = (work: Work | undefined, action: (work: Work) => Promise<boolean>) => {
    if (!work) return Promise.resolve(undefined)
    if (work.operation.current()) {
      void action(work).then(work.operation.succeed, work.operation.fail)
    }
    return work.operation.result
  }
  const addAttachments = (files: File[], toast = true, target = capture(), done?: () => void) =>
    run(begin("preparing", target, done), (work) => batch(files, work, toast))

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
    if (files.length > 0) return addAttachments(files, true, target)
    const text = clipboardText(clipboardData)
    if (input.readClipboardImage && !text) {
      return run(begin("preparing", target), async (work) => {
        const file = await input.readClipboardImage!()
        return file && work.operation.current() ? add(file, work, true, true) : false
      })
    }
    if (!text) return
    const put = () => {
      if (input.addPart({ type: "text", content: text, start: 0, end: 0 })) return true
      input.focusEditor()
      return input.addPart({ type: "text", content: text, start: 0, end: 0 })
    }
    if (text.includes("\n") || largePaste(text)) {
      put()
      return
    }
    if (insertComposerText(text)) return
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
  const report = async <T>(action: () => Promise<T>) => {
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
    makeEventListener(target, "drop", (event) => void report(() => handleDrop(event)))
  })

  return {
    preparing: preparation.preparing,
    cancelPending: preparation.cancel,
    addAttachments,
    handlePaste: (event: ClipboardEvent) => report(() => handlePaste(event)),
    handleDrop: (event: DragEvent) => report(() => handleDrop(event)),
    handleDragOver,
    handleDragLeave,
    acceptPickedFiles(files: File[], done?: () => void) {
      const work = browserChoice
      browserChoice = undefined
      if (!work) return addAttachments(files, true, capture(), done)
      work.operation.selected()
      return run(work, (work) => batch(files, work))
    },
    cancelPicker() {
      const work = browserChoice
      browserChoice = undefined
      work?.operation.succeed()
    },
    pick(fallback: () => void, done?: () => void) {
      // A file input has one outstanding change/cancel callback, even after its draft is retired.
      if (!input.picker && browserChoice) return
      const work = begin("choosing", capture(), done)
      if (!work?.operation.current()) return
      if (!input.picker) {
        browserChoice = work
        try {
          fallback()
        } catch (error) {
          browserChoice = undefined
          work.operation.fail(error)
        }
        return
      }
      return run(work, async (work) => {
        await input.picker!(
          { defaultPath: input.directory(), multiple: true, accept: [...ACCEPTED_FILE_TYPES] },
          (file) => {
            work.operation.selected()
            return add(file, work)
          },
          {
            signal: work.operation.signal,
            selected: work.operation.selected,
            complete: () => work.operation.succeed(true),
          },
        )
        return true
      })
    },
  }
}

function largePaste(text: string) {
  if (text.length >= 8000) return true
  return text.split("\n").length - 1 >= 120
}
