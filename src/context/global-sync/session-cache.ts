import type { Message, Part } from "@opencode-ai/sdk"
import { currentSession, setState, state } from "@/context/server-session"
import type { OpencodeClient } from "@/context/server-sdk"

export type HistoryItem = {
  info: Message
  parts: Part[]
}

let messageRefreshCount = 0

type ActiveSession = {
  client: OpencodeClient
  sessionID: string
}

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

function missingAssistantParentIDs(items: HistoryItem[], requested = new Set<string>()) {
  const messageIDs = new Set(items.map((item) => item.info.id))
  return [
    ...new Set(
      items.flatMap((item) =>
        item.info.role === "assistant" && !messageIDs.has(item.info.parentID) && !requested.has(item.info.parentID)
          ? [item.info.parentID]
          : [],
      ),
    ),
  ]
}

function cachedMessages(messageIDs: string[]) {
  const ids = new Set(messageIDs)
  return state.messages.filter((item) => ids.has(item.info.id))
}

async function fetchParentMessages(active: ActiveSession, parentIDs: string[]) {
  const cached = new Map(cachedMessages(parentIDs).map((item) => [item.info.id, item] as const))
  const fetched = await Promise.all(
    parentIDs.map((messageID) =>
      active.client.session
        .message({
          path: { id: active.sessionID, messageID },
        })
        .then((result) => result.data)
        .catch(() => undefined),
    ),
  )
  const parents = new Map(
    normalizeHistory(fetched.filter((item): item is { info: Message; parts: Part[] } => !!item)).map((item) => [
      item.info.id,
      item,
    ]),
  )
  parentIDs
    .filter((parentID) => !parents.has(parentID) && cached.has(parentID))
    .forEach((parentID) => {
      const item = cached.get(parentID)
      if (item) parents.set(parentID, item)
    })
  return normalizeHistory([...parents.values()])
}

async function hydrateAssistantParents(active: ActiveSession, items: HistoryItem[]) {
  let hydrated = items
  const requested = new Set<string>()
  while (true) {
    const parentIDs = missingAssistantParentIDs(hydrated, requested)
    if (parentIDs.length === 0) return hydrated
    parentIDs.forEach((id) => requested.add(id))
    const parents = await fetchParentMessages(active, parentIDs)
    if (parents.length === 0) return hydrated
    hydrated = normalizeHistory([...hydrated, ...parents])
  }
}

export function refreshMessages(limit: number) {
  const active = currentSession()
  if (!active) return Promise.resolve()
  messageRefreshCount += 1
  setState("messagesLoading", true)
  return active.client.session
    .messages({
      path: { id: active.sessionID },
      query: { limit },
    })
    .then((result) => {
      if (state.session?.id !== active.sessionID) return
      return hydrateAssistantParents(active, normalizeHistory(result.data ?? []))
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
