import type {
  OpenCodeClient,
  OpenCodeEvent,
  SessionInboxInfo,
  SessionInfo,
  SessionMessageInfo,
} from "@opencode/client/promise"
import { createStore, reconcile, unwrap } from "solid-js/store"
import { inboxItemMessage } from "./session-messages"

type MessagePage = Awaited<ReturnType<OpenCodeClient["message"]["list"]>>

const chronological = (messages: SessionMessageInfo[]) =>
  [...new Map(messages.map((message) => [message.id, message])).values()].sort(
    (a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id),
  )
const live = (message: SessionMessageInfo) =>
  message.type === "assistant"
    ? !message.time.completed
    : (message.type === "shell" || message.type === "compaction") && message.status === "running"
const copy = <T>(value: T): T => structuredClone(unwrap(value))

// This cache only owns compact history overlays and snapshot reconciliation. The
// public client still owns durable messages and all streamed assistant content.
export function createSessionMessageCache(input: {
  messages: () => SessionMessageInfo[]
  get: (id: string) => SessionMessageInfo | undefined
  pending: () => SessionInboxInfo[]
  session: () => SessionInfo
}) {
  const touched = new Map<string, number>()
  const removed = new Set<string>()
  const cursors = new Set<string>()
  const [local, setLocal] = createStore({
    echoes: {} as Record<string, SessionMessageInfo | undefined>,
    extra: {} as Record<string, SessionMessageInfo | undefined>,
  })
  const messages = () => {
    const admitted = input.pending()
    const queued = new Set(admitted.filter((item) => item.delivery === "queue").map((item) => item.id))
    const rows = chronological([
      ...Object.values(local.echoes).filter((row): row is SessionMessageInfo => !!row),
      ...admitted.flatMap((item) => inboxItemMessage(item) ?? []),
      ...input.messages(),
      ...Object.values(local.extra).filter((row): row is SessionMessageInfo => !!row),
    ])
    return rows.filter((row) => !queued.has(row.id) && !removed.has(row.id))
  }

  return {
    messages,
    echo(message: SessionMessageInfo) {
      setLocal("echoes", message.id, copy(message))
    },
    dropEcho(messageID: string) {
      setLocal("echoes", messageID, undefined)
    },
    pendingChanged(before: SessionInboxInfo[], next: SessionInboxInfo[]) {
      const retained = new Set(next.map((item) => item.id))
      for (const id of retained) removed.delete(id)
      for (const item of before) if (!retained.has(item.id)) removed.add(item.id)
    },
    snapshot(request: { cursor?: string }, response: MessagePage, started: number): MessagePage {
      const rows = copy(response.data)
      let next = response.cursor.next
      if (!request.cursor) cursors.clear()
      if (request.cursor) cursors.add(request.cursor)
      if (!rows.length || (next && cursors.has(next)) || (request.cursor && rows.every((row) => input.get(row.id))))
        next = undefined
      if (request.cursor) return { ...response, data: rows, cursor: { ...response.cursor, next } }
      const durable = new Map(rows.map((row) => [row.id, row]))
      const retained = input
        .messages()
        .filter(
          (row) =>
            !removed.has(row.id) &&
            ((touched.get(row.id) ?? 0) > started ||
              (live(row) && (!durable.has(row.id) || live(durable.get(row.id)!)))),
        )
      const messages = chronological([...rows.filter((row) => !removed.has(row.id)), ...retained])
      for (const row of rows) {
        if ((touched.get(row.id) ?? 0) > started) continue
        setLocal("extra", row.id, undefined)
        setLocal("echoes", row.id, undefined)
      }
      return { ...response, data: messages.toReversed(), cursor: { ...response.cursor, next } }
    },
    // Called in the same batch as pending receipts and the shared data reducer.
    apply(event: OpenCodeEvent, revision: number, admitted: SessionInboxInfo | undefined) {
      const values = event.data as { assistantMessageID?: string; inboxID?: string }
      const existing = input.messages()
      const related =
        event.type === "session.shell.ended"
          ? existing.findLast((row) => row.type === "shell" && row.shellID === event.data.shell.id)?.id
          : event.type.startsWith("session.compaction.") && event.type !== "session.compaction.started"
            ? existing.findLast((row) => row.type === "compaction" && row.status === "running")?.id
            : undefined
      const key = values.assistantMessageID ?? values.inboxID ?? related ?? event.id.replace(/^evt_/, "msg_")
      const missing = !!values.assistantMessageID && event.type !== "session.step.started" && !input.get(key)
      touched.set(key, revision)
      if (event.type === "session.step.started") {
        const previous = existing.findLast((row) => row.type === "assistant" && !row.time.completed)
        if (previous) touched.set(previous.id, revision)
      }
      if (event.type.startsWith("session.inbox.") && values.inboxID) setLocal("echoes", values.inboxID, undefined)
      if (event.type === "session.inbox.delivered" && admitted && !input.get(admitted.id)) {
        const message = inboxItemMessage(admitted)
        if (message) setLocal("extra", admitted.id, { ...copy(message), time: { created: event.created } })
      }
      if (event.type === "session.inbox.cancelled") removed.add(event.data.inboxID)
      if (event.type === "session.inbox.enqueued") removed.delete(event.data.inboxID)
      if (event.type === "session.skill.activated")
        setLocal("extra", key, {
          id: key,
          type: "skill",
          skill: event.data.id,
          name: event.data.name,
          text: event.data.text,
          metadata: copy(event.metadata),
          time: { created: event.created },
        })
      const previous = input.session()
      if (event.type === "session.agent.selected")
        setLocal("extra", key, {
          id: key,
          type: "agent-switched",
          agent: event.data.agent,
          previous: event.data.previous ?? previous?.agent,
          metadata: copy(event.metadata),
          time: { created: event.created },
        })
      if (event.type === "session.model.selected")
        setLocal("extra", key, {
          id: key,
          type: "model-switched",
          model: copy(event.data.model),
          previous: copy(event.data.previous ?? previous?.model),
          metadata: copy(event.metadata),
          time: { created: event.created },
        })
      if (event.type === "session.revert.committed") {
        for (const row of messages()) if (row.id >= event.data.to) removed.add(row.id)
        setLocal("extra", reconcile({}))
      }
      return missing
    },
  }
}
