import { createStore } from "solid-js/store"
import type { Accessor } from "solid-js"
import type { SessionInboxInfo } from "@opencode/client/promise"
import type { ComposerDelivery, ComposerQueue } from "@/composer/adapter"
import type { PromptDraft, PromptState } from "@/composer/state"
import { translateSync } from "@/runtime/i18n/language"
import { currentSession, setState, state } from "@/runtime/server/session-store-compact"
import { updatePendingInbox } from "@/runtime/server/global-sync/session-cache-messages"
import { scheduleRefresh } from "@/runtime/server/sync-session-compact"
import { readableError } from "@/shell/errors/readable"

export type QueuedPrompt = Extract<SessionInboxInfo, { type: "user" }>

// The server owns delivery and persistence; undo restores only representable drafts.
export function createSessionQueue(input: {
  draft: PromptState
  restoreFocus: (cursor: number) => void
  working: Accessor<boolean>
  disabled: Accessor<boolean>
  behavior?: Accessor<ComposerDelivery>
}) {
  const [mutation, setMutation] = createStore({ pending: false, undoing: false })
  const queued = () =>
    state.sessionPending.filter(
      (item): item is QueuedPrompt =>
        item.sessionID === state.session?.id && item.type === "user" && item.delivery === "queue",
    )
  const busy = () => input.disabled() || mutation.pending
  const change = async (id: string, action: "steer" | "remove" | "undo") => {
    if (busy()) return
    const item = queued().find((item) => item.id === id)
    if (!item) return
    const restored = action === "undo" ? queuedPromptUndoDraft(item) : undefined
    if (action === "undo" && !restored) {
      setState("error", translateSync("session.queue.undoUnavailable"))
      return
    }
    const active = currentSession()
    if (!active) return
    // An activation gets a new client, even when switching away and back to the same session.
    const ownsSession = () => state.session?.id === active.sessionID && currentSession()?.client === active.client
    setMutation({ pending: true, undoing: action === "undo" })
    setState("error", "")
    try {
      if (action === "steer") {
        await active.client.session.inbox.update({ sessionID: active.sessionID, inboxID: id, delivery: "steer" })
      } else {
        await active.client.session.inbox.cancel({ sessionID: active.sessionID, inboxID: id })
      }
      if (!ownsSession()) return
      updatePendingInbox((items) =>
        action === "steer"
          ? items.map((item) => (item.id === id ? { ...item, delivery: "steer" } : item))
          : items.filter((item) => item.id !== id),
      )
      if (restored) {
        // Read after cancellation so changes made while the request was pending survive.
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
      scheduleRefresh(0)
    } catch (error) {
      if (ownsSession()) setState("error", readableError(error))
    } finally {
      setMutation({ pending: false, undoing: false })
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
    undoing: () => mutation.undoing,
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

// Use model-visible text so notes survive. The compact draft persists file mentions
// and inline attachments, but cannot retain agent/skill references or hidden file context.
export function queuedPromptUndoDraft(item: QueuedPrompt): PromptDraft | undefined {
  const payload = item.payload
  if (payload.agents?.length || payload.skills?.length) return
  if (payload.files?.some((file) => !file.mention && file.source.type !== "inline")) return
  const references = (payload.files ?? [])
    .flatMap((file) => {
      if (!file.mention) return []
      return [
        {
          type: "file" as const,
          path: file.mention.text.replace(/^@/, ""),
          content: file.mention.text,
          start: file.mention.start,
          end: file.mention.end,
          url: `data:${file.mime};base64,${file.data}`,
        },
      ]
    })
    .sort((left, right) => left.start - right.start)
  if (
    references.some(
      (reference, index) =>
        !Number.isInteger(reference.start) ||
        !Number.isInteger(reference.end) ||
        reference.start < (references[index - 1]?.end ?? 0) ||
        reference.end <= reference.start ||
        reference.end > payload.text.length ||
        payload.text.slice(reference.start, reference.end) !== reference.content,
    )
  )
    return
  return {
    prompt: payload.text,
    ...(references.length ? { references } : {}),
    attachments: (payload.files ?? []).flatMap((file, index) =>
      file.mention
        ? []
        : [
            {
              id: `${item.id}:file:${index}`,
              filename: file.name ?? "attachment",
              mime: file.mime,
              url: `data:${file.mime};base64,${file.data}`,
            },
          ],
    ),
  }
}
