// Reduces current-message events for the one active session and delegates missed hydration to the refresh queue.
import type { OpenCodeEvent, SessionStatus } from "@opencode/client/promise"
import { createV2SessionReducer } from "@/runtime/server/session-reducer-compact"
import { currentSession, idleStatus, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { filterQueuedMessages, forgetPendingEcho, inboxItemMessage, updatePendingInbox } from "./session-cache-messages"

const reducer = createV2SessionReducer()

function applyReduction(event: OpenCodeEvent, refresh: () => void) {
  const active = currentSession()
  if (!active) return false
  const reduction = reducer.reduce(state.sessionMessages, event, state.session)
  if (!reduction) return false
  setState("sessionMessages", filterQueuedMessages(reduction.messages))
  if (reduction.missing) refresh()
  return true
}

export function applySessionEvent(event: OpenCodeEvent, input: { refresh: () => void }) {
  const data = event.data as {
    sessionID?: string
    status?: SessionStatus
    error?: unknown
    title?: string
    revert?: unknown
  }
  if (!data.sessionID || data.sessionID !== state.session?.id) return false
  if (event.type === "session.inbox.enqueued") {
    const item = {
      ...event.data.item,
      id: event.data.inboxID,
      sessionID: data.sessionID,
      time: { created: event.created },
    }
    forgetPendingEcho(item.id)
    updatePendingInbox((items) => [...items.filter((entry) => entry.id !== item.id), item])
  }
  if (event.type === "session.inbox.delivered" || event.type === "session.inbox.cancelled") {
    const item = state.sessionPending.find((item) => item.id === event.data.inboxID)
    if (item) reducer.confirm(item)
    forgetPendingEcho(event.data.inboxID)
    updatePendingInbox((items) => items.filter((item) => item.id !== event.data.inboxID))
  }
  if (event.type === "session.inbox.delivery.changed") {
    const item = state.sessionPending.find((item) => item.id === event.data.inboxID)
    updatePendingInbox((items) =>
      items.map((item) => (item.id === event.data.inboxID ? { ...item, delivery: event.data.delivery } : item)),
    )
    if (!item) {
      input.refresh()
      return true
    }
    const message = event.data.delivery === "steer" ? inboxItemMessage(item) : undefined
    setState("sessionMessages", (items) => [
      ...items.filter((entry) => entry.id !== item.id),
      ...(message ? [message] : []),
    ])
    return true
  }
  if (event.type === "session.execution.started") {
    setState("sessionStatus", { type: "busy" })
  }
  if (
    event.type === "session.execution.succeeded" ||
    event.type === "session.execution.failed" ||
    event.type === "session.execution.interrupted"
  ) {
    setState("sessionStatus", idleStatus)
  }
  if (event.type === "session.status" && data.status) {
    setState("sessionStatus", data.status)
    return true
  }
  if (event.type === "session.idle") {
    setState("sessionStatus", idleStatus)
    input.refresh()
    return true
  }
  if (event.type === "session.execution.failed") {
    setState("error", readableError(data.error))
  }
  if (event.type === "session.renamed" && data.title) setState("session", "title", data.title)
  if (event.type === "session.revert.staged" && data.revert) {
    setState("session", "revert", data.revert as NonNullable<typeof state.session>["revert"])
  }
  if (event.type === "session.revert.cleared" || event.type === "session.revert.committed") {
    setState("session", "revert", undefined)
  }
  if (applyReduction(event, input.refresh)) return true
  if (event.type.startsWith("session.") || event.type.startsWith("message.")) {
    input.refresh()
    return true
  }
  return false
}
