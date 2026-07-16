// Live message cache for the one active session; the adapter lives in session-cache-projection.ts.
import type { Message, Part } from "@opencode-ai/client"
import {
  compareHistoryItem,
  comparePart,
  mergeHistoryPart,
  projectSessionMessages,
} from "@/context/global-sync/session-cache-projection"
import { currentSession, setState, state } from "@/context/server-session-store"

let messageRefreshCount = 0

export function refreshMessages(limit: number) {
  const active = currentSession()
  if (!active || !state.session) return Promise.resolve()
  messageRefreshCount += 1
  setState("messagesLoading", true)
  return active.client.message
    .list({ sessionID: active.sessionID, limit, order: "desc" })
    .then((result) => {
      const session = state.session
      if (session?.id !== active.sessionID) return
      return projectSessionMessages({
        sessionID: active.sessionID,
        session,
        localAgent: active.localAgent,
        messages: result.data,
      })
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
        partIndex === index ? mergeHistoryPart(current, part, delta) : current,
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
