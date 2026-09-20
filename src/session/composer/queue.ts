import { createStore } from "solid-js/store"
import type { Accessor } from "solid-js"
import type { SessionInboxInfo } from "@opencode/client/promise"
import type { ComposerDelivery, ComposerQueue } from "@/composer/adapter"
import { currentSession, setState, state } from "@/runtime/server/session-store-compact"
import { updatePendingInbox } from "@/runtime/server/global-sync/session-cache-messages"
import { scheduleRefresh } from "@/runtime/server/sync-session-compact"
import { readableError } from "@/shell/errors/readable"

export type QueuedPrompt = Extract<SessionInboxInfo, { type: "user" }>

// The server owns delivery and persistence; the compact view offers send and remove.
export function createSessionQueue(input: {
  working: Accessor<boolean>
  disabled: Accessor<boolean>
  behavior?: Accessor<ComposerDelivery>
}) {
  const [mutation, setMutation] = createStore<{ sessionID?: string; id?: string }>({})
  const queued = () =>
    state.sessionPending.filter(
      (item): item is QueuedPrompt =>
        item.sessionID === state.session?.id && item.type === "user" && item.delivery === "queue",
    )
  const busy = () => input.disabled() || (mutation.sessionID === state.session?.id && !!mutation.id)
  const change = async (id: string, action: "steer" | "remove") => {
    if (busy() || !queued().some((item) => item.id === id)) return
    const active = currentSession()
    if (!active) return
    setMutation({ sessionID: active.sessionID, id })
    try {
      if (action === "steer") {
        await active.client.session.inbox.update({ sessionID: active.sessionID, inboxID: id, delivery: "steer" })
      } else {
        await active.client.session.inbox.cancel({ sessionID: active.sessionID, inboxID: id })
      }
      if (state.session?.id !== active.sessionID) return
      updatePendingInbox((items) =>
        action === "remove"
          ? items.filter((item) => item.id !== id)
          : items.map((item) => (item.id === id ? { ...item, delivery: "steer" } : item)),
      )
      scheduleRefresh(0)
    } catch (error) {
      if (state.session?.id === active.sessionID) setState("error", readableError(error))
    } finally {
      if (mutation.sessionID === active.sessionID && mutation.id === id)
        setMutation({ sessionID: undefined, id: undefined })
    }
  }
  const delivery: ComposerQueue = {
    count: () => queued().length,
    delivery: () => (input.working() ? (input.behavior?.() ?? "steer") : "steer"),
    alternate: () => {
      if (!input.working()) return undefined
      return input.behavior?.() === "queue" ? "steer" : "queue"
    },
  }
  return {
    ...delivery,
    rows: () => queuedPromptRows(queued()),
    working: input.working,
    busy,
    steer: (id: string) => change(id, "steer"),
    remove: (id: string) => change(id, "remove"),
  }
}

export type SessionQueue = ReturnType<typeof createSessionQueue>
export type SessionQueueView = Pick<SessionQueue, "rows" | "working" | "busy" | "steer" | "remove">

export function queuedPromptRows(items: QueuedPrompt[]) {
  return items.map((item) => ({
    id: item.id,
    text: queuedPromptText(item),
    attachments: item.payload.files?.length ?? 0,
  }))
}

export function queuedPromptText(item: QueuedPrompt) {
  const display = item.payload.metadata?.["displayText"]
  return typeof display === "string" && display.length > 0 ? display : item.payload.text
}
