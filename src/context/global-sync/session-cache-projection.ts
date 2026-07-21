import type {
  AssistantMessage,
  Message,
  Part,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageUser,
} from "@opencode-ai/client"
import type { HistoryItem } from "@/context/global-sync/types"
import type { Session } from "@/context/session-directory"

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

function userHistoryItem(context: ProjectionContext, message: SessionMessageUser): HistoryItem {
  const sessionModel = context.session?.model
  const parts: Part[] = [
    ...(message.text
      ? [
          {
            id: `${message.id}-text`,
            sessionID: context.sessionID,
            messageID: message.id,
            type: "text" as const,
            text: message.text,
          },
        ]
      : []),
    ...(message.files ?? []).map((file, index) => ({
      id: `${message.id}-file-${index}`,
      sessionID: context.sessionID,
      messageID: message.id,
      type: "file" as const,
      mime: file.mime,
      filename: file.name,
      url: file.source.type === "uri" ? file.source.uri : `data:${file.mime};base64,${file.data}`,
    })),
  ]
  return {
    info: {
      id: message.id,
      sessionID: context.sessionID,
      role: "user",
      time: message.time,
      agent: context.session?.agent ?? context.localAgent,
      model: sessionModel
        ? { providerID: sessionModel.providerID, modelID: sessionModel.id }
        : { providerID: "", modelID: "" },
    },
    parts,
  }
}

function toolOutput(tool: SessionMessageAssistantTool) {
  return tool.state.status === "streaming"
    ? tool.state.input
    : tool.state.content.map((item) => (item.type === "text" ? item.text : item.uri)).join("\n")
}

function toolPart(sessionID: string, messageID: string, tool: SessionMessageAssistantTool): Part {
  const time = tool.time.created
  const base = {
    id: tool.id,
    sessionID,
    messageID,
    type: "tool" as const,
    callID: tool.id,
    tool: tool.name,
  }
  if (tool.state.status === "streaming") {
    return { ...base, state: { status: "pending", input: {}, raw: tool.state.input } }
  }
  if (tool.state.status === "running") {
    return { ...base, state: { status: "running", input: tool.state.input, time: { start: time } } }
  }
  if (tool.state.status === "error") {
    return {
      ...base,
      state: {
        status: "error",
        input: tool.state.input,
        error: tool.state.error.message,
        time: { start: time, end: tool.time.completed ?? time },
      },
    }
  }
  return {
    ...base,
    state: {
      status: "completed",
      input: tool.state.input,
      output: toolOutput(tool),
      title: tool.name,
      metadata: {},
      time: { start: time, end: tool.time.completed ?? time },
    },
  }
}

function assistantHistoryItem(
  context: ProjectionContext,
  parentID: string,
  message: SessionMessageAssistant,
): HistoryItem {
  const parts = message.content.map((content, index): Part => {
    if (content.type === "tool") return toolPart(context.sessionID, message.id, content)
    if (content.type === "file")
      return {
        id: `${message.id}-file-${index}`,
        sessionID: context.sessionID,
        messageID: message.id,
        type: "file",
        mime: content.mime,
        filename: content.filename,
        url: content.url,
      } as Part
    return {
      id: `${message.id}-${content.type}-${index}`,
      sessionID: context.sessionID,
      messageID: message.id,
      type: content.type,
      text: content.text,
      ...(content.type === "reasoning"
        ? { time: { start: content.time?.created ?? message.time.created, end: content.time?.completed } }
        : {}),
    } as Part
  })
  const directory = context.session?.location.directory ?? ""
  return {
    info: {
      id: message.id,
      sessionID: context.sessionID,
      role: "assistant",
      time: message.time,
      parentID,
      modelID: message.model.id,
      providerID: message.model.providerID,
      mode: message.agent,
      agent: message.agent,
      path: { cwd: directory, root: directory },
      cost: message.cost ?? 0,
      tokens: message.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      finish: message.finish,
      error: message.error
        ? ({ name: message.error.type, data: { message: message.error.message } } as AssistantMessage["error"])
        : undefined,
    } as Message,
    parts,
  }
}

export function projectSessionMessages(input: ProjectionContext & { messages: SessionMessageInfo[] }) {
  const result: HistoryItem[] = []
  let parentID: string | undefined
  const ordered = input.messages.toSorted((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))
  for (const message of ordered) {
    if (message.type === "user") {
      parentID = message.id
      result.push(userHistoryItem(input, message))
      continue
    }
    if (message.type === "assistant" && parentID) result.push(assistantHistoryItem(input, parentID, message))
  }
  return normalizeHistory(result)
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
