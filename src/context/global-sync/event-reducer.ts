import type { Event as OpencodeEvent } from "@opencode-ai/sdk"
import { idleStatus, setState, state } from "@/context/server-session"
import { removeMessage, removePart, upsertMessage, upsertPart } from "@/context/global-sync/session-cache"
import { readableError } from "@/utils/server-errors"

export function applySessionEvent(event: OpencodeEvent, input: { refresh: () => void }) {
  if (event.type === "session.updated" && event.properties.info.id === state.session?.id) {
    setState("session", event.properties.info)
    return true
  }
  if (event.type === "message.updated" && event.properties.info.sessionID === state.session?.id) {
    upsertMessage(event.properties.info)
    return true
  }
  if (event.type === "message.removed" && event.properties.sessionID === state.session?.id) {
    removeMessage(event.properties.messageID)
    return true
  }
  if (event.type === "message.part.updated" && event.properties.part.sessionID === state.session?.id) {
    upsertPart(event.properties.part, event.properties.delta, input.refresh)
    return true
  }
  if (event.type === "message.part.removed" && event.properties.sessionID === state.session?.id) {
    removePart(event.properties.messageID, event.properties.partID)
    return true
  }
  if (event.type === "session.status" && event.properties.sessionID === state.session?.id) {
    setState("sessionStatus", event.properties.status)
    return true
  }
  if (event.type === "session.idle" && event.properties.sessionID === state.session?.id) {
    setState("sessionStatus", idleStatus)
    input.refresh()
    return true
  }
  if (
    event.type === "session.error" &&
    (!event.properties.sessionID || event.properties.sessionID === state.session?.id)
  ) {
    setState("error", readableError(event.properties.error))
    return true
  }
  return false
}
