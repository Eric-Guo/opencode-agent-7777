import { Skill } from "@opencode/schema/skill"
import type {
  ComposerAgentPart,
  ComposerAttachment,
  ComposerFilePart,
  ComposerPrompt,
  ComposerSkillPart,
} from "../types"
import { isAttachment } from "../prompt-parts"

export function getCursorPosition(editor: HTMLElement) {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return editor.textContent?.length ?? 0
  const range = selection.getRangeAt(0).cloneRange()
  range.selectNodeContents(editor)
  range.setEnd(selection.anchorNode!, selection.anchorOffset)
  return range.toString().length
}

export function setCursorPosition(editor: HTMLElement | undefined, cursor: number) {
  if (!editor) return
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  let remaining = cursor
  let node = walker.nextNode()
  while (node) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return
    }
    remaining -= length
    node = walker.nextNode()
  }
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
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
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
