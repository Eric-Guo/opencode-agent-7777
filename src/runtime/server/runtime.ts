import { createData, type CreateDataInput, type Data } from "@opencode/client/solid"
import type {
  OpenCodeClient,
  OpenCodeEvent,
  SessionInboxInfo,
  SessionInfo,
  SessionMessageInfo,
  SessionStatus,
} from "@opencode/client/promise"
import { batch, createComputed, createRoot, onCleanup, untrack } from "solid-js"
import { createStore, reconcile, unwrap } from "solid-js/store"
import { FETCH_MESSAGE_LIMIT, HISTORY_DIALOG_LIMIT } from "@/constants/session"
import { inboxItemMessage } from "./global-sync/session-messages"

type EventListener = Parameters<CreateDataInput["event"]["listen"]>[0]
export type SessionView = {
  session: SessionInfo
  sessionMessages: SessionMessageInfo[]
  sessionPending: SessionInboxInfo[]
  sessionStatus: SessionStatus
  messagesLoading: boolean
}

const chronological = (messages: SessionMessageInfo[]) =>
  [...new Map(messages.map((message) => [message.id, message])).values()].sort(
    (a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id),
  )
const live = (message: SessionMessageInfo) =>
  message.type === "assistant"
    ? !message.time.completed
    : (message.type === "shell" || message.type === "compaction") && message.status === "running"
const copy = <T>(value: T): T => structuredClone(unwrap(value))

/** One activation owns its data, subscriptions, optimistic presentation and pending reads. */
export type SessionRuntime = {
  api: OpenCodeClient
  data: Data
  events: CreateDataInput["event"]
  id: string
  signal: AbortSignal
  statusRevision: () => number
  dispose: () => void
  publish: () => void
  view: () => SessionView
  alive: () => boolean
  pendingRevision: () => number
  refreshMessages: (limit?: number) => Promise<void>
  schedule: (delay?: number) => void
  setSession: (info: SessionInfo) => void
  setStatus: (status: SessionStatus) => void
  echo: (message: SessionMessageInfo) => void
  dropEcho: (messageID: string) => void
  updatePending: (update: (items: SessionInboxInfo[]) => SessionInboxInfo[]) => void
  apply: (event: OpenCodeEvent) => boolean
}

export function createSessionRuntime(input: {
  client: OpenCodeClient
  session: SessionInfo
  changed: (view: SessionView) => void
  error: (error: unknown) => void
}): SessionRuntime {
  return createRoot((dispose) => {
    const id = input.session.id
    const abort = new AbortController()
    const listeners = new Set<EventListener>()
    const touched = new Map<string, number>()
    const removed = new Set<string>()
    const cursors = new Set<string>()
    let revision = 0
    let statusRevision = 0
    let sessionRevision = 0
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let refresh: Promise<void> | undefined
    let refreshAgain = false
    let initialLimit = FETCH_MESSAGE_LIMIT
    const [local, setLocal] = createStore({
      echoes: {} as Record<string, SessionMessageInfo | undefined>,
      extra: {} as Record<string, SessionMessageInfo | undefined>,
      receipts: {} as Record<string, { item?: SessionInboxInfo; revision: number } | undefined>,
      status: undefined as SessionStatus | undefined,
      loading: false,
      pendingRevision: 0,
    })
    const events: CreateDataInput["event"] = {
      listen(handler) {
        listeners.add(handler)
        return () => listeners.delete(handler)
      },
      on(type, handler) {
        return events.listen(({ details }) => {
          if (details.type === type) handler(details as never)
        })
      },
    }
    const options = (value?: Parameters<OpenCodeClient["message"]["list"]>[1]) => ({
      ...value,
      signal: value?.signal ?? abort.signal,
    })
    const read = async <T>(promise: Promise<T>) => {
      const value = await promise
      abort.signal.throwIfAborted()
      return value
    }
    // Only snapshot publication needs a copy. Streamed content remains the shared store's reactive objects.
    const api: OpenCodeClient = {
      ...input.client,
      session: {
        ...input.client.session,
        async get(request, init) {
          const started = sessionRevision
          const session = await read(input.client.session.get(request, options(init)))
          return copy(started === sessionRevision ? session : data.session.get(id))
        },
        message: {
          ...input.client.session.message,
          get: (request, init) => read(input.client.session.message.get(request, options(init))),
        },
        inbox: {
          ...input.client.session.inbox,
          list: (request, init) => read(input.client.session.inbox.list(request, options(init))),
        },
      },
      model: { ...input.client.model, list: (request, init) => read(input.client.model.list(request, options(init))) },
      provider: {
        ...input.client.provider,
        list: (request, init) => read(input.client.provider.list(request, options(init))),
      },
      agent: { ...input.client.agent, list: (request, init) => read(input.client.agent.list(request, options(init))) },
      command: {
        ...input.client.command,
        list: (request, init) => read(input.client.command.list(request, options(init))),
      },
      skill: { ...input.client.skill, list: (request, init) => read(input.client.skill.list(request, options(init))) },
      message: {
        ...input.client.message,
        async list(request, init) {
          const started = revision
          const response = await read(input.client.message.list(request, options(init)))
          const rows = copy(response.data)
          let next = response.cursor.next
          if (!request.cursor) cursors.clear()
          if (request.cursor) cursors.add(request.cursor)
          if (
            !rows.length ||
            (next && cursors.has(next)) ||
            (request.cursor && rows.every((row) => data.session.message.get(id, row.id)))
          )
            next = undefined
          if (request.cursor) return { ...response, data: rows, cursor: { ...response.cursor, next } }
          const durable = new Map(rows.map((row) => [row.id, row]))
          const retained = data.session.message
            .list(id)
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
      },
    }
    const data = createData({
      api: () => api,
      directory: input.session.location.directory,
      initialMessageLimit: () => initialLimit,
      event: events,
      onError(error) {
        if (!abort.signal.aborted) input.error(error)
      },
    })
    data.session.remember(copy(input.session))
    const pending = () => {
      const items = new Map(data.session.pending.list(id).map((item) => [item.id, item]))
      for (const [key, receipt] of Object.entries(local.receipts)) {
        if (!receipt) continue
        if (receipt.item) items.set(key, receipt.item)
        else items.delete(key)
      }
      return [...items.values()]
    }
    const messages = () => {
      const admitted = pending()
      const queued = new Set(admitted.filter((item) => item.delivery === "queue").map((item) => item.id))
      const rows = chronological([
        ...Object.values(local.echoes).filter((row): row is SessionMessageInfo => !!row),
        ...admitted.flatMap((item) => inboxItemMessage(item) ?? []),
        ...data.session.message.list(id),
        ...Object.values(local.extra).filter((row): row is SessionMessageInfo => !!row),
      ])
      return rows.filter(
        (row) =>
          !queued.has(row.id) && !removed.has(row.id) && !(local.receipts[row.id] && !local.receipts[row.id]?.item),
      )
    }
    const view = (): SessionView => ({
      session: data.session.get(id),
      sessionMessages: messages(),
      sessionPending: pending(),
      sessionStatus: local.status ?? (data.session.status(id) === "running" ? { type: "busy" } : { type: "idle" }),
      messagesLoading: local.loading,
    })
    const publish = () => {
      const value = view()
      untrack(() => input.changed(value))
    }
    createComputed(publish)
    onCleanup(() => {
      abort.abort()
      clearTimeout(refreshTimer)
      listeners.clear()
    })
    const refreshMessages = (limit = FETCH_MESSAGE_LIMIT): Promise<void> => {
      if (abort.signal.aborted) return Promise.resolve()
      if (refresh) {
        refreshAgain = true
        return refresh
      }
      initialLimit = limit
      setLocal("loading", true)
      data.session.pending.invalidate(id)
      data.session.message.invalidate(id)
      const run = (async () => {
        do {
          refreshAgain = false
          const started = revision
          await Promise.all([data.session.pending.sync(id), data.session.message.sync(id)])
          batch(() => {
            for (const [key, receipt] of Object.entries(local.receipts)) {
              if (receipt && receipt.revision <= started) setLocal("receipts", key, undefined)
            }
          })
          abort.signal.throwIfAborted()
          while (
            messages().filter((row) => row.type === "user" || row.type === "shell").length < HISTORY_DIALOG_LIMIT &&
            data.session.message.more(id)
          ) {
            await data.session.message.loadMore(id, { signal: abort.signal })
          }
          if (refreshAgain) {
            data.session.pending.invalidate(id)
            data.session.message.invalidate(id)
          }
        } while (refreshAgain)
      })().finally(() => {
        refresh = undefined
        if (!abort.signal.aborted) setLocal("loading", false)
      })
      refresh = run
      return run
    }
    const schedule = (delay = 120) => {
      if (abort.signal.aborted) return
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        void refreshMessages().catch((error) => {
          if (!abort.signal.aborted) input.error(error)
        })
      }, delay)
    }
    return {
      api: input.client,
      data,
      events,
      id,
      signal: abort.signal,
      statusRevision: () => statusRevision,
      dispose,
      publish,
      view,
      alive: () => !abort.signal.aborted,
      pendingRevision: () => local.pendingRevision,
      refreshMessages,
      schedule,
      setSession(info: SessionInfo) {
        sessionRevision++
        data.session.remember(copy(info))
      },
      setStatus(status: SessionStatus) {
        statusRevision++
        batch(() => {
          data.session.setStatus(id, status.type === "idle" ? "idle" : "running")
          setLocal("status", status.type === "retry" ? copy(status) : undefined)
        })
      },
      echo(message: SessionMessageInfo) {
        setLocal("echoes", message.id, copy(message))
      },
      dropEcho(messageID: string) {
        setLocal("echoes", messageID, undefined)
      },
      updatePending(update: (items: SessionInboxInfo[]) => SessionInboxInfo[]) {
        const before = pending()
        const next = update(before)
        revision++
        batch(() => {
          setLocal("pendingRevision", (value) => value + 1)
          for (const item of next) {
            removed.delete(item.id)
            setLocal("receipts", item.id, { item: copy(item), revision })
          }
          for (const item of before)
            if (!next.some((row) => row.id === item.id)) {
              removed.add(item.id)
              setLocal("receipts", item.id, { item: undefined, revision })
            }
        })
      },
      apply(event: OpenCodeEvent) {
        if (abort.signal.aborted || event.type === "server.connected") return false
        if (!event.type.startsWith("session.")) return false
        if ("sessionID" in event.data && event.data.sessionID !== id) return false
        const values = event.data as { assistantMessageID?: string; inboxID?: string }
        const admitted = values.inboxID ? pending().find((item) => item.id === values.inboxID) : undefined
        const unloadedInbox =
          event.type === "session.inbox.delivery.changed" &&
          !data.session.pending.list(id).some((item) => item.id === event.data.inboxID)
        const existing = data.session.message.list(id)
        const related =
          event.type === "session.shell.ended"
            ? existing.findLast((row) => row.type === "shell" && row.shellID === event.data.shell.id)?.id
            : event.type.startsWith("session.compaction.") && event.type !== "session.compaction.started"
              ? existing.findLast((row) => row.type === "compaction" && row.status === "running")?.id
              : undefined
        const key = values.assistantMessageID ?? values.inboxID ?? related ?? event.id.replace(/^evt_/, "msg_")
        const missing =
          values.assistantMessageID && event.type !== "session.step.started" && !data.session.message.get(id, key)
        revision++
        if (
          [
            "session.agent.selected",
            "session.model.selected",
            "session.moved",
            "session.usage.updated",
            "session.permissions",
            "session.revert.staged",
            "session.revert.cleared",
            "session.revert.committed",
          ].includes(event.type)
        )
          sessionRevision++
        touched.set(key, revision)
        if (event.type === "session.step.started") {
          const previous = existing.findLast((row) => row.type === "assistant" && !row.time.completed)
          if (previous) touched.set(previous.id, revision)
        }
        batch(() => {
          if (event.type.startsWith("session.execution.")) {
            statusRevision++
            setLocal("status", undefined)
          }
          if (event.type.startsWith("session.inbox.")) {
            setLocal("pendingRevision", (value) => value + 1)
            if (values.inboxID) {
              setLocal("echoes", values.inboxID, undefined)
              setLocal("receipts", values.inboxID, undefined)
            }
          }
          if (event.type === "session.inbox.delivery.changed" && unloadedInbox && admitted) {
            setLocal("receipts", admitted.id, { item: { ...copy(admitted), delivery: event.data.delivery }, revision })
          }
          if (event.type === "session.inbox.delivered" && admitted && !data.session.message.get(id, admitted.id)) {
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
          const previous = data.session.get(id)
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
          listeners.forEach((listener) => listener({ name: event.type, details: copy(event) }))
        })
        if (
          missing ||
          unloadedInbox ||
          (event.type === "session.inbox.delivered" && !data.session.message.get(id, event.data.inboxID))
        )
          schedule()
        return true
      },
    }
  })
}
