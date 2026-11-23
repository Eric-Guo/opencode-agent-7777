import type { SessionUserComment } from "@opencode/session-ui/actions"
import type { SessionUserPresentation } from "@opencode/session-ui/timeline"
import { isRecord } from "@opencode/util/record"
import type { FileSelection } from "./types"

export type PromptComment = {
  path: string
  selection?: FileSelection
  comment: string
  preview?: string
  origin?: "review" | "file"
}

function selection(selection: unknown) {
  if (!isRecord(selection)) return
  const startLine = Number(selection.startLine)
  const startChar = Number(selection.startChar)
  const endLine = Number(selection.endLine)
  const endChar = Number(selection.endChar)
  if (![startLine, startChar, endLine, endChar].every(Number.isFinite)) return undefined
  return {
    startLine,
    startChar,
    endLine,
    endChar,
  } satisfies FileSelection
}

export function createCommentMetadata(input: PromptComment) {
  return {
    opencodeComment: {
      path: input.path,
      selection: input.selection,
      comment: input.comment,
      preview: input.preview,
      origin: input.origin,
    },
  }
}

export function readCommentMetadata(value: unknown) {
  if (isRecord(value) && isRecord(value.opencodeComment)) return readFileComment(value.opencodeComment)
}

function readFileComment(value: Record<string, unknown>) {
  const { path, comment, preview, origin } = value
  if (typeof path !== "string" || typeof comment !== "string") return
  return {
    path,
    selection: selection(value.selection),
    comment,
    preview: typeof preview === "string" ? preview : undefined,
    origin: origin === "review" || origin === "file" ? origin : undefined,
  } satisfies PromptComment
}

function readPresentationComment(value: unknown): SessionUserComment | undefined {
  if (!isRecord(value)) return
  const { type, comment } = value
  switch (type) {
    case "quote": {
      const { text, source } = value
      if (typeof text !== "string") return
      return {
        type,
        text,
        comment: typeof comment === "string" ? comment : undefined,
        source:
          isRecord(source) && typeof source.label === "string" && typeof source.icon === "string"
            ? { label: source.label, icon: source.icon }
            : undefined,
      }
    }
    case "note": {
      const { label, icon, title, subtitle } = value
      if (typeof label !== "string" || typeof icon !== "string" || typeof comment !== "string") return
      return {
        type,
        label,
        icon,
        comment,
        title: typeof title === "string" ? title : undefined,
        subtitle: typeof subtitle === "string" ? subtitle : undefined,
      }
    }
    case "browser": {
      // Older clients recorded a picked element. Its label and comment still describe it after the tab is gone.
      const { element } = value
      if (typeof comment !== "string") return
      if (!isRecord(element) || typeof element.selector !== "string" || typeof element.label !== "string") return
      return { type: "note", label: element.label, icon: "select-element", comment }
    }
    default:
      return readFileComment(value)
  }
}

function readReferences(attachments: unknown[]) {
  return attachments.flatMap((file) => {
    if (!isRecord(file)) return []
    const { name, mime, path } = file
    if (typeof name !== "string" || typeof mime !== "string" || typeof path !== "string") return []
    return [{ name, mime, path }]
  })
}

export function readPromptPresentation(value: unknown) {
  if (!isRecord(value)) return
  const { displayText, comments, attachments } = value
  if (typeof displayText !== "string" || !Array.isArray(comments)) return
  return {
    displayText,
    comments: comments.flatMap((item) => {
      const comment = readPresentationComment(item)
      return comment ? [comment] : []
    }),
    ...(Array.isArray(attachments) ? { references: readReferences(attachments) } : {}),
  } satisfies SessionUserPresentation
}

export function formatCommentNote(input: { path: string; selection?: FileSelection; comment: string }) {
  const start = input.selection ? Math.min(input.selection.startLine, input.selection.endLine) : undefined
  const end = input.selection ? Math.max(input.selection.startLine, input.selection.endLine) : undefined
  const range =
    start === undefined || end === undefined
      ? "this file"
      : start === end
        ? `line ${start}`
        : `lines ${start} through ${end}`
  return `The user made the following comment regarding ${range} of ${input.path}: ${input.comment}`
}

export function parseCommentNote(text: string) {
  const match = text.match(
    /^The user made the following comment regarding (this file|line (\d+)|lines (\d+) through (\d+)) of (.+?): ([\s\S]+)$/,
  )
  if (!match) return
  const start = match[2] ? Number(match[2]) : match[3] ? Number(match[3]) : undefined
  const end = match[2] ? Number(match[2]) : match[4] ? Number(match[4]) : undefined
  return {
    path: match[5],
    selection:
      start !== undefined && end !== undefined
        ? {
            startLine: start,
            startChar: 0,
            endLine: end,
            endChar: 0,
          }
        : undefined,
    comment: match[6],
  } satisfies PromptComment
}
