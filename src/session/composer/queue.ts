import { batch, createComputed, createMemo, createSignal, on, onCleanup, untrack, type Accessor } from "solid-js"
import type { SessionInboxInfo } from "@opencode/client/promise"
import type { SessionUserActions } from "@opencode/session-ui/actions"
import type { ComposerDelivery, ComposerQueue } from "@/composer/adapter"
import { extractPromptFromQueued as queuedPromptUndoDraft } from "@/composer/prompt"
import type { PromptState } from "@/composer/state"
import { translateSync } from "@/runtime/i18n/language"
import type { SessionRuntime } from "@/runtime/server/runtime"
import { currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { captureSessionOwnership } from "@/session/session-ownership"
import { readableError } from "@/shell/errors/readable"
import {
  createQueueState,
  selectQueueBusy,
  selectQueueUndoing,
  transitionQueue,
  type QueueEvent,
  type QueueOperation,
} from "./queue-machine"

export type QueuedPrompt = Extract<SessionInboxInfo, { type: "user" }>
export { queuedPromptUndoDraft }

// The server owns delivery and persistence; undo restores only representable drafts.
export function createSessionQueue(input: {
  draft: PromptState
  restoreFocus: (cursor: number) => void
  working: Accessor<boolean>
  disabled: Accessor<boolean>
  behavior?: Accessor<ComposerDelivery>
}) {
  const [mutation, setMutation] = createSignal(createQueueState())
  let finish: VoidFunction | undefined
  const dispatch = (event: QueueEvent, active?: NonNullable<ReturnType<typeof captureSessionOwnership>>) => {
    const previous = untrack(mutation)
    const next = transitionQueue(previous, event)
    if (next.state === previous) return false
    batch(() => {
      setMutation(next.state)
      if (previous.status === "running") {
        const complete = finish
        finish = undefined
        complete?.()
      }
      if (!active?.current()) return
      if (untrack(mutation) !== next.state) return
      for (const effect of next.effects) {
        if (effect.type === "failed") setState("error", readableError(effect.error))
        if (effect.type === "refresh") active.runtime.schedule(0)
        if (effect.type !== "apply") continue
        const { id, action, restored } = effect.operation
        if (event.type === "succeeded")
          active.runtime.updatePending((items) =>
            action === "steer" || action === "queue"
              ? items.map((item) => (item.id === id ? { ...item, delivery: action } : item))
              : items.filter((item) => item.id !== id),
          )
        if (!restored) continue
        // Read only after acknowledgement, so other draft writers survive cancellation.
        const draft = input.draft.capture()
        const prefix = draft.prompt ? `${draft.prompt}\n\n` : ""
        const references = [
          ...(draft.references ?? []),
          ...(restored.references ?? []).map((reference) => ({
            ...reference,
            start: reference.start + prefix.length,
            end: reference.end + prefix.length,
          })),
        ]
        input.draft.restore({
          prompt: prefix + restored.prompt,
          attachments: [...draft.attachments, ...restored.attachments],
          ...(references.length ? { references } : {}),
        })
        input.restoreFocus(input.draft.current().length)
      }
    })
    return true
  }
  createComputed(on([currentRuntime, () => state.session?.id], () => dispatch({ type: "reset" }), { defer: true }))
  onCleanup(() => dispatch({ type: "disposed" }))
  const queued = () =>
    state.sessionPending.filter(
      (item): item is QueuedPrompt =>
        item.sessionID === state.session?.id && item.type === "user" && item.delivery === "queue",
    )
  const busy = () => input.disabled() || selectQueueBusy(mutation())
  const timelineOwner = (runtime: SessionRuntime) =>
    runtime.alive() &&
    currentRuntime() === runtime &&
    state.session?.id === runtime.id &&
    !state.session.parentID &&
    !state.recentSessionSwitchingID
  const change = async (id: string, action: QueueOperation["action"], timeline?: SessionRuntime) => {
    if (busy() || untrack(mutation).status === "disposed") return
    const findItem = () => {
      if (timeline && !timelineOwner(timeline)) return
      return state.sessionPending.find(
        (item): item is QueuedPrompt =>
          item.id === id &&
          item.sessionID === state.session?.id &&
          item.type === "user" &&
          item.delivery === (timeline ? "steer" : "queue"),
      )
    }
    const item = findItem()
    if (!item) return
    const restored = action === "undo" ? queuedPromptUndoDraft(item) : undefined
    if (action === "undo" && !restored) {
      setState("error", translateSync("session.queue.undoUnavailable"))
      return
    }
    const active = captureSessionOwnership()
    if (!active || !dispatch({ type: "requested", operation: { id, action, restored } })) return
    const current = untrack(mutation)
    if (current.status !== "running") return
    const { attempt } = current
    const done = Promise.withResolvers<void>()
    const retire = () => dispatch({ type: "reset" })
    const stop = active.runtime.events.listen(({ details: event }) => {
      if (
        !active.current() ||
        !("inboxID" in event.data) ||
        event.data.sessionID !== active.sessionID ||
        event.data.inboxID !== id
      )
        return
      if (event.type === "session.inbox.delivery.changed")
        dispatch({ type: "delivery.changed", delivery: event.data.delivery, attempt }, active)
      if (event.type === "session.inbox.cancelled" || event.type === "session.inbox.delivered")
        dispatch({ type: event.type === "session.inbox.cancelled" ? "cancelled" : "delivered", attempt }, active)
    })
    active.runtime.signal.addEventListener("abort", retire, { once: true })
    finish = () => {
      stop()
      active.runtime.signal.removeEventListener("abort", retire)
      done.resolve()
    }
    setState("error", "")
    if (untrack(mutation) !== current) return done.promise
    if (!active.current() || input.disabled() || !findItem()) {
      retire()
      return done.promise
    }
    // A sent mutation may still commit after navigation. Retire its UI ownership,
    // but leave the transport's existing deadline in charge of the request.
    void Promise.try(() =>
      action === "steer" || action === "queue"
        ? active.client.session.inbox.update({ sessionID: active.sessionID, inboxID: id, delivery: action })
        : active.client.session.inbox.cancel({ sessionID: active.sessionID, inboxID: id }),
    ).then(
      () => dispatch({ type: "succeeded", attempt }, active),
      (error: unknown) => dispatch({ type: "failed", attempt, error }, active),
    )
    return done.promise
  }
  const pending = createMemo<SessionUserActions["pending"]>(() => {
    const runtime = currentRuntime()
    if (!runtime || !timelineOwner(runtime)) return
    return {
      status: runtime.pendingStatus,
      async queue({ sessionID, messageID }) {
        if (sessionID === runtime.id) await change(messageID, "queue", runtime)
      },
      async remove({ sessionID, messageID }) {
        if (sessionID === runtime.id) await change(messageID, "remove", runtime)
      },
    }
  })
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
    pending,
    rows: () => queuedPromptRows(queued()),
    working: input.working,
    busy,
    undoing: () => selectQueueUndoing(mutation()),
    steer: (id: string) => change(id, "steer"),
    remove: (id: string) => change(id, "remove"),
    undo: (id: string) => change(id, "undo"),
  }
}

export type SessionQueue = ReturnType<typeof createSessionQueue>
export type SessionQueueView = Pick<SessionQueue, "rows" | "working" | "busy" | "steer" | "remove" | "undo">

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
