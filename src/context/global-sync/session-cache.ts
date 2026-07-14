import type {
  AssistantMessage,
  Message,
  Part,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageUser,
} from "@opencode-ai/client"
import { AGENT_ID } from "@/constants/session"
import { currentSession, setState, state } from "@/context/server-session"
import type { OpencodeClient } from "@/context/server-sdk"

export type HistoryItem = {
  info: Message
  parts: Part[]
}

let messageRefreshCount = 0

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

export function normalizeHistory(items: { info: Message; parts: Part[] }[]): HistoryItem[] {
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

function userHistoryItem(sessionID: string, message: SessionMessageUser): HistoryItem {
  const sessionModel = state.session?.model
  const parts: Part[] = [
    ...(message.text
      ? [
          {
            id: `${message.id}-text`,
            sessionID,
            messageID: message.id,
            type: "text" as const,
            text: message.text,
          },
        ]
      : []),
    ...(message.files ?? []).map((file, index) => ({
      id: `${message.id}-file-${index}`,
      sessionID,
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
      sessionID,
      role: "user",
      time: message.time,
      agent: state.session?.agent ?? AGENT_ID,
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

function assistantHistoryItem(sessionID: string, parentID: string, message: SessionMessageAssistant): HistoryItem {
  const parts = message.content.map((content, index): Part => {
    if (content.type === "tool") return toolPart(sessionID, message.id, content)
    return {
      id: `${message.id}-${content.type}-${index}`,
      sessionID,
      messageID: message.id,
      type: content.type,
      text: content.text,
      ...(content.type === "reasoning"
        ? { time: { start: content.time?.created ?? message.time.created, end: content.time?.completed } }
        : {}),
    } as Part
  })
  return {
    info: {
      id: message.id,
      sessionID,
      role: "assistant",
      time: message.time,
      parentID,
      modelID: message.model.id,
      providerID: message.model.providerID,
      mode: message.agent,
      agent: message.agent,
      path: { cwd: state.session?.location.directory ?? "", root: state.session?.location.directory ?? "" },
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

export function projectSessionMessages(sessionID: string, messages: SessionMessageInfo[]) {
  const result: HistoryItem[] = []
  let parentID: string | undefined
  const ordered = messages.toSorted((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))
  for (const message of ordered) {
    if (message.type === "user") {
      parentID = message.id
      result.push(userHistoryItem(sessionID, message))
      continue
    }
    if (message.type === "assistant" && parentID) result.push(assistantHistoryItem(sessionID, parentID, message))
  }
  return normalizeHistory(result)
}

export function refreshMessages(limit: number) {
  const active = currentSession()
  if (!active) return Promise.resolve()
  messageRefreshCount += 1
  setState("messagesLoading", true)
  return active.client.message
    .list({ sessionID: active.sessionID, limit, order: "desc" })
    .then((result) => {
      if (state.session?.id !== active.sessionID) return
      return projectSessionMessages(active.sessionID, result.data)
    })
    .then((messages) => {
      if (!messages || state.session?.id !== active.sessionID) return
      setState("messages", messages)
    })
    .finally(() => {
      messageRefreshCount = Math.max(0, messageRefreshCount - 1)
      if (messageRefreshCount === 0) setState("messagesLoading", false)
    })
}

export function upsertMessage(info: Message) {
  setState("messages", (items) => {
    const withoutLocal = info.role === "user" ? items.filter((item) => !item.info.id.startsWith("local-")) : items
    const index = withoutLocal.findIndex((item) => item.info.id === info.id)
    if (index === -1) return [...withoutLocal, { info, parts: [] }].sort(compareHistoryItem)
    return withoutLocal.map((item, itemIndex) => (itemIndex === index ? { ...item, info } : item))
  })
}

function mergePart(existing: Part | undefined, incoming: Part, delta: string | undefined): Part {
  if (!delta) return incoming
  if (!existing) return incoming
  if (!isTextLikePart(existing) || !isTextLikePart(incoming)) return incoming
  if (incoming.text.length >= existing.text.length) return incoming
  return {
    ...incoming,
    text: `${existing.text}${delta}`,
  }
}

export function upsertPart(part: Part, delta: string | undefined, refresh: () => void) {
  const hasMessage = state.messages.some((item) => item.info.id === part.messageID)
  if (!hasMessage) {
    refresh()
    return
  }
  setState("messages", (items) =>
    items.map((item) => {
      if (item.info.id !== part.messageID) return item
      const index = item.parts.findIndex((current) => current.id === part.id)
      if (index === -1) return { ...item, parts: [...item.parts, part].sort(comparePart) }
      const parts = item.parts.map((current, partIndex) =>
        partIndex === index ? mergePart(current, part, delta) : current,
      )
      return { ...item, parts: parts.sort(comparePart) }
    }),
  )
}

export function removeMessage(messageID: string) {
  setState("messages", (items) => items.filter((item) => item.info.id !== messageID))
}

export function removePart(messageID: string, partID: string) {
  setState("messages", (items) =>
    items.map((item) =>
      item.info.id === messageID ? { ...item, parts: item.parts.filter((part) => part.id !== partID) } : item,
    ),
  )
}
