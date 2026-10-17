import { Skill } from "@opencode/schema/skill"
import type {
  ComposerAgentPart,
  ComposerAttachment,
  ComposerFilePart,
  ComposerPrompt,
  ComposerSkillPart,
} from "../types"
import { isAttachment } from "../prompt-parts"

function getTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0
  if (node instanceof HTMLElement && node.tagName === "BR") return 1
  return Array.from(node.childNodes).reduce((length, child) => length + getTextLength(child), 0)
}

// Attachments capture the beginning of a selection; typing follows its anchor.
export function getCursorPosition(editor: HTMLElement, edge: "anchor" | "start" = "anchor") {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined
  const node = edge === "start" ? range?.startContainer : selection?.anchorNode
  if (!range || !node || !editor.contains(node)) return edge === "start" ? 0 : getTextLength(editor)
  const before = range.cloneRange()
  before.selectNodeContents(editor)
  before.setEnd(node, edge === "start" ? range.startOffset : selection!.anchorOffset)
  return getTextLength(before.cloneContents())
}

export function setCursorPosition(editor: HTMLElement | undefined, cursor: number) {
  if (!editor) return
  const range = document.createRange()
  let remaining = Math.max(0, cursor)
  const visit = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0
      if (remaining <= length) {
        range.setStart(node, remaining)
        return true
      }
      remaining -= length
      return false
    }
    if (!(node instanceof HTMLElement)) return false
    const mention = !!node.dataset.mention
    if (mention || node.tagName === "BR") {
      const length = mention ? (node.textContent?.length ?? 0) : 1
      if (remaining <= length) {
        // Mentions are atomic, non-editable pills. Never place a caret in their text node.
        if (remaining === 0) range.setStartBefore(node)
        else if (!mention && node.nextSibling?.nodeType === Node.TEXT_NODE) range.setStart(node.nextSibling, 0)
        else range.setStartAfter(node)
        return true
      }
      remaining -= length
      return false
    }
    return Array.from(node.childNodes).some(visit)
  }
  if (!Array.from(editor.childNodes).some(visit)) {
    range.selectNodeContents(editor)
    range.collapse(false)
  } else range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

const mentionParts = new WeakMap<HTMLElement, Exclude<ComposerPrompt[number], ComposerAttachment | { type: "text" }>>()

export function renderComposerEditor(editor: HTMLDivElement, prompt: ComposerPrompt) {
  const active = document.activeElement === editor
  editor.replaceChildren(
    ...prompt.flatMap<Node>((part) => {
      if (isAttachment(part)) return []

      if (part.type === "text") return [document.createTextNode(part.content)]
      const mention = document.createElement("span")
      mentionParts.set(mention, part)
      mention.textContent = part.content
      mention.contentEditable = "false"
      mention.dir = "auto"
      mention.style.unicodeBidi = "isolate"
      mention.dataset.mention =
        part.type === "file" && part.mime === "application/x-directory" ? "reference" : part.type

      if (part.type === "agent") mention.dataset.name = part.name

      if (part.type === "skill") {
        mention.dataset.id = part.id
        mention.dataset.name = part.name
      }

      if (part.type === "file") {
        mention.dataset.path = part.path

        if (part.mime) mention.dataset.mime = part.mime

        if (part.filename) mention.dataset.filename = part.filename
      }

      return [mention]
    }),
  )

  if (!active) return
  setCursorPosition(editor, getTextLength(editor))
}

export function parseComposerEditor(editor: HTMLDivElement) {
  const parts: Exclude<ComposerPrompt[number], ComposerAttachment>[] = []
  let buffer = ""
  let position = 0

  const flush = () => {
    if (!buffer) return
    parts.push({ type: "text", content: buffer, start: position, end: position + buffer.length })
    position += buffer.length
    buffer = ""
  }

  const mention = (element: HTMLElement) => {
    flush()
    const content = element.textContent ?? ""
    const original = mentionParts.get(element)

    if (element.dataset.mention === "agent") {
      const agent: ComposerAgentPart = {
        type: "agent",
        name: element.dataset.name ?? content.slice(1),
        content,
        start: position,
        end: position + content.length,
      }

      parts.push(original?.type === "agent" ? { ...original, ...agent } : agent)
      position += content.length

      return
    }

    if (element.dataset.mention === "skill") {
      const skill: ComposerSkillPart = {
        type: "skill",
        id: Skill.ID.make(element.dataset.id ?? content.slice(1)),
        name: Skill.Name.make(element.dataset.name ?? content.slice(1)),
        content,
        start: position,
        end: position + content.length,
      }

      parts.push(original?.type === "skill" ? { ...original, ...skill } : skill)
      position += content.length

      return
    }

    const parsed: ComposerFilePart = {
      type: "file",
      path: element.dataset.path ?? content.slice(1),
      content,
      start: position,
      end: position + content.length,
    }

    const file: ComposerFilePart = original?.type === "file" ? { ...original, ...parsed } : parsed

    if (element.dataset.mime) file.mime = element.dataset.mime

    if (element.dataset.filename) file.filename = element.dataset.filename
    parts.push(file)
    position += content.length
  }

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.textContent ?? ""

      return
    }

    if (!(node instanceof HTMLElement)) return

    if (node.dataset.mention) {
      mention(node)

      return
    }

    if (node.tagName === "BR") {
      buffer += "\n"

      return
    }

    Array.from(node.childNodes).forEach(visit)
  }

  Array.from(editor.childNodes).forEach((node, index, nodes) => {
    visit(node)

    if (node instanceof HTMLElement && ["DIV", "P"].includes(node.tagName) && index < nodes.length - 1) buffer += "\n"
  })
  flush()

  if (
    parts.every((part) => part.type === "text") &&
    parts.every((part) => part.content.replace(/[\n\u200B]/g, "") === "")
  ) {
    return [{ type: "text" as const, content: "", start: 0, end: 0 }]
  }

  if (parts.length > 0) return parts

  return [{ type: "text" as const, content: "", start: 0, end: 0 }]
}
