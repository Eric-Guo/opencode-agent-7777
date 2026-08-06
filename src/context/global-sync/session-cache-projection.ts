import type { HistoryItem } from "@/context/global-sync/types"
import { normalizeSessionMessages } from "@/utils/session-message"
import type { Part, Session, SessionMessageInfo } from "@/types"

// Compact history-store adaptation around the shared current-message normalization boundary.

function isTextPart(part: Part): part is Extract<Part, { type: "text" }> {
  return part.type === "text"
}

function isReasoningPart(part: Part): part is Extract<Part, { type: "reasoning" }> {
  return part.type === "reasoning"
}

function isTextLikePart(part: Part): part is Extract<Part, { type: "text" | "reasoning" }> {
  return isTextPart(part) || isReasoningPart(part)
}

export function compareHistoryItem(a: HistoryItem, b: HistoryItem) {
  const diff = a.info.time.created - b.info.time.created
  if (diff !== 0) return diff
  return a.info.id < b.info.id ? -1 : a.info.id > b.info.id ? 1 : 0
}

export function comparePart(a: Part, b: Part) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function normalizeHistory(items: HistoryItem[]): HistoryItem[] {
  return [
    ...items
      .filter((item) => !!item.info?.id)
      .reduce((byID, item) => {
        byID.set(item.info.id, {
          info: item.info,
          parts: item.parts.filter((part) => !!part.id).sort(comparePart),
        })
        return byID
      }, new Map<string, HistoryItem>())
      .values(),
  ].sort(compareHistoryItem)
}

type ProjectionContext = {
  sessionID: string
  session: Session | undefined
  localAgent: string
}

export function projectSessionMessages(input: ProjectionContext & { messages: SessionMessageInfo[] }) {
  const ordered = input.messages.toSorted((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))
  const normalized = normalizeSessionMessages(input.sessionID, ordered)
  const directory = input.session?.location.directory ?? ""
  const sessionModel = input.session?.model

  return normalizeHistory(
    normalized.messages.map(
      (message): HistoryItem => ({
        info:
          message.role === "assistant"
            ? { ...message, path: { cwd: directory, root: directory } }
            : {
                ...message,
                agent: message.agent || input.session?.agent || input.localAgent,
                model:
                  message.model.providerID || !sessionModel
                    ? message.model
                    : { providerID: sessionModel.providerID, modelID: sessionModel.id, variant: sessionModel.variant },
              },
        parts: normalized.parts.get(message.id) ?? [],
      }),
    ),
  )
}

export function mergeHistoryPart(existing: Part | undefined, incoming: Part, delta: string | undefined): Part {
  if (!delta || !existing) return incoming
  if (!isTextLikePart(existing) || !isTextLikePart(incoming)) return incoming
  if (incoming.text.length >= existing.text.length) return incoming
  return {
    ...incoming,
    text: `${existing.text}${delta}`,
  }
}
