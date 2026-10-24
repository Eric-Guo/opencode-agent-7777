import { createData, type CreateDataInput } from "@opencode/client/solid"
import type {
  OpenCodeClient,
  OpenCodeEvent,
  SessionInboxInfo,
  SessionInfo,
  SessionMessageInfo,
  SessionStatus,
} from "@opencode/client/promise"
import { batch, onCleanup, type Accessor } from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import { createSessionMessageCache } from "./global-sync/session-cache-messages"

type EventListener = Parameters<CreateDataInput["event"]["listen"]>[0]
export type SessionDataView = {
  session: SessionInfo
  sessionMessages: SessionMessageInfo[]
  sessionPending: SessionInboxInfo[]
  sessionStatus: SessionStatus
}

const copy = <T>(value: T): T => structuredClone(unwrap(value))

// Activation-local compatibility around the shared client's data. The runtime owns
// its Solid root, cancellation signal and refresh scheduling; this adapter owns
// snapshot guards and optimistic overlays, and batches them with shared events.
export function createSessionData(input: {
  client: OpenCodeClient
  session: SessionInfo
  signal: AbortSignal
  initialMessageLimit: Accessor<number>
  refresh: () => void
  error: (error: unknown) => void
}) {
  const id = input.session.id
  const listeners = new Set<EventListener>()
  let revision = 0
  let statusRevision = 0
  let sessionRevision = 0
  const [local, setLocal] = createStore({ status: undefined as SessionStatus | undefined })
  const pending = createSessionPending(() => data.session.pending.list(id))
  const cache = createSessionMessageCache({
    messages: () => data.session.message.list(id),
    get: (key) => data.session.message.get(id, key),
    pending: pending.list,
    session: () => data.session.get(id),
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
    signal: value?.signal ?? input.signal,
  })
  const read = async <T>(promise: Promise<T>) => {
    const value = await promise
    input.signal.throwIfAborted()
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
    integration: {
      ...input.client.integration,
      list: (request, init) => read(input.client.integration.list(request, options(init))),
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
        return cache.snapshot(request, response, started)
      },
    },
  }
  const data = createData({
    api: () => api,
    directory: input.session.location.directory,
    initialMessageLimit: input.initialMessageLimit,
    event: events,
    onError(error) {
      if (!input.signal.aborted) input.error(error)
    },
  })
  data.session.remember(copy(input.session))
  const view = (): SessionDataView => ({
    session: data.session.get(id),
    sessionMessages: cache.messages(),
    sessionPending: pending.list(),
    sessionStatus: local.status ?? (data.session.status(id) === "running" ? { type: "busy" } : { type: "idle" }),
  })
  onCleanup(() => listeners.clear())

  return {
    data,
    events,
    view,
    messages: cache.messages,
    revision: () => revision,
    acknowledgePending: pending.acknowledge,
    mutations: {
      statusRevision: () => statusRevision,
      pendingRevision: pending.revision,
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
      echo: cache.echo,
      dropEcho: cache.dropEcho,
      updatePending(update: (items: SessionInboxInfo[]) => SessionInboxInfo[]) {
        const before = pending.list()
        const next = update(before)
        revision++
        batch(() => {
          pending.replace(before, next, revision)
          cache.pendingChanged(before, next)
        })
      },
      apply(event: OpenCodeEvent) {
        if (input.signal.aborted || event.type === "server.connected") return false
        if (!event.type.startsWith("session.")) return false
        if ("sessionID" in event.data && event.data.sessionID !== id) return false
        const values = event.data as { assistantMessageID?: string; inboxID?: string }
        const admitted = values.inboxID ? pending.list().find((item) => item.id === values.inboxID) : undefined
        const unloadedInbox =
          event.type === "session.inbox.delivery.changed" &&
          !data.session.pending.list(id).some((item) => item.id === event.data.inboxID)
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
        let missing = false
        batch(() => {
          if (event.type.startsWith("session.execution.")) {
            statusRevision++
            setLocal("status", undefined)
          }
          pending.apply(event, revision, admitted, unloadedInbox)
          missing = cache.apply(event, revision, admitted)
          listeners.forEach((listener) => listener({ name: event.type, details: copy(event) }))
        })
        if (
          missing ||
          unloadedInbox ||
          (event.type === "session.inbox.delivered" && !data.session.message.get(id, event.data.inboxID))
        )
          input.refresh()
        return true
      },
    },
  }
}

// HTTP receipts overlay the shared inbox until a newer snapshot or SSE event
// acknowledges them. Keeping this separate from message projection makes their
// retirement policy independent of which transcript rows are currently visible.
function createSessionPending(shared: () => SessionInboxInfo[]) {
  const [local, setLocal] = createStore({
    receipts: {} as Record<string, { item?: SessionInboxInfo; revision: number } | undefined>,
    revision: 0,
  })
  return {
    revision: () => local.revision,
    list() {
      const items = new Map(shared().map((item) => [item.id, item]))
      for (const [key, receipt] of Object.entries(local.receipts)) {
        if (!receipt) continue
        if (receipt.item) items.set(key, receipt.item)
        else items.delete(key)
      }
      return [...items.values()]
    },
    replace(before: SessionInboxInfo[], next: SessionInboxInfo[], revision: number) {
      setLocal("revision", (value) => value + 1)
      for (const item of next) setLocal("receipts", item.id, { item: copy(item), revision })
      const retained = new Set(next.map((item) => item.id))
      for (const item of before)
        if (!retained.has(item.id)) setLocal("receipts", item.id, { item: undefined, revision })
    },
    acknowledge(revision: number) {
      batch(() => {
        for (const [key, receipt] of Object.entries(local.receipts))
          if (receipt && receipt.revision <= revision) setLocal("receipts", key, undefined)
      })
    },
    apply(event: OpenCodeEvent, revision: number, admitted: SessionInboxInfo | undefined, unloaded: boolean) {
      if (!event.type.startsWith("session.inbox.")) return
      setLocal("revision", (value) => value + 1)
      if ("inboxID" in event.data) setLocal("receipts", event.data.inboxID, undefined)
      if (event.type === "session.inbox.delivery.changed" && unloaded && admitted)
        setLocal("receipts", admitted.id, { item: { ...copy(admitted), delivery: event.data.delivery }, revision })
    },
  }
}
