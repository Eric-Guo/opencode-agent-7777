import type { SessionMessage } from "@opencode/schema/session-message"
import type { AgentPart, ImageAttachmentPart, PromptFileReference, SkillPart, TextPart } from "./schema"

export type { AgentPart, ImageAttachmentPart, SkillPart, TextPart } from "./schema"

export type FileSelection = {
  startLine: number
  startChar: number
  endLine: number
  endChar: number
}

type FilePartSourceText = { value: string; start: number; end: number }
export type FilePartSource =
  | { text: FilePartSourceText; type: "file"; path: string }
  | {
      text: FilePartSourceText
      type: "symbol"
      path: string
      range: { start: { line: number; character: number }; end: { line: number; character: number } }
      name: string
      kind: number
    }
  | { text: FilePartSourceText; type: "resource"; clientName: string; uri: string }

// Editor-only metadata extends the persisted reference without changing its storage format.
export interface FileAttachmentPart extends PromptFileReference {
  selection?: FileSelection
  mime?: string
  filename?: string
  source?: FilePartSource
}

export type ContentPart = TextPart | FileAttachmentPart | AgentPart | SkillPart | ImageAttachmentPart
export type Prompt = ContentPart[]

export type PromptModel = {
  providerID: string
  modelID: string
  variant?: string | null
}

export type FileContextItem = {
  type: "file"
  path: string
  selection?: FileSelection
  comment?: string
  commentID?: string
  commentOrigin?: "review" | "file"
  preview?: string
}

export type ContextItem = FileContextItem
export type PromptScope = { draftID: string } | { dir: string; id?: string }

export type ComposerStore = {
  prompt: Prompt
  cursor?: number
  model?: PromptModel
  mode?: "normal" | "shell"
  retry?: {
    id: SessionMessage.ID
    agent: string
    providerID: string
    modelID: string
    variant?: string
  }
  context: {
    items: (ContextItem & { key: string })[]
  }
}

export type ComposerFilePart = FileAttachmentPart
export type ComposerAgentPart = AgentPart
export type ComposerSkillPart = SkillPart
export type ComposerAttachment = ImageAttachmentPart
export type ComposerPrompt = Prompt
export type ComposerComment = ComposerStore["context"]["items"][number]
export type ComposerPersistedState = ComposerStore

export type ComposerHistoryEntry = {
  prompt: ComposerPrompt
  metadata?: unknown
}

export type ComposerHistory = {
  entries: (mode: "normal" | "shell") => ComposerHistoryEntry[]
  add: (prompt: ComposerPrompt, mode: "normal" | "shell") => void
  capture?: () => unknown
  restore?: (metadata: unknown) => void
}

export type ComposerCapabilities = {
  commands?: boolean
  context?: boolean
  shell?: boolean
}

export type ComposerOption = {
  id: string
  label: string
  providerID?: string
}

export type ComposerSuggestion = {
  id: string
  kind: "agent" | "command" | "file" | "reference" | "resource" | "skill"
  label: string
  title?: string
  trigger?: string
  description?: string
  path?: string
  keybind?: string[]
  recent?: boolean
  mention?: ComposerFilePart | ComposerAgentPart | ComposerSkillPart
}
