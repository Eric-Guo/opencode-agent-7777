import { createData, type CreateDataInput, type DataPendingStatus } from "@opencode/client/solid"
import type {
  OpenCodeClient,
  OpenCodeEvent,
  SessionInboxInfo,
  SessionInfo,
  SessionMessageInfo,
  SessionStatus,
} from "@opencode/client/promise"
import { batch, createMemo, onCleanup, type Accessor } from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import { boundedReadClient } from "./read-client"
import { createSessionMessageCache } from "./global-sync/session-cache-messages"
import { createSessionPending } from "./global-sync/session-cache-pending"
import { createSessionShells, type ShellInventoryReads } from "./global-sync/session-shells-compact"

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
  const client = boundedReadClient(input.client, input.signal)
  const id = input.session.id
  const shellReads: ShellInventoryReads = new Map()
  const listeners = new Set<EventListener>()
  let revision = 0
  let statusRevision = 0
  let sessionRevision = 0
  const [local, setLocal] = createStore({ status: undefined as SessionStatus | undefined })
  const pending = createSessionPending(() => data.session.pending.list(id))
  const cache = createSessionMessageCache({
    messages: () => data.session.message.list(id),
    get: (key) => data.session.message.get(id, key),
    pending,
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
  const publishEvent = (event: OpenCodeEvent) =>
    listeners.forEach((listener) => listener({ name: event.type, details: copy(event) }))
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
    ...client,
    shell: {
      ...client.shell,
      list(request, init) {
        const list = request?.location?.directory && shellReads.get(request.location.directory)
        return list && !init ? list() : client.shell.list(request, init)
      },
    },
    session: {
      ...client.session,
      async get(request, init) {
        const started = sessionRevision
        const session = await read(client.session.get(request, options(init)))
        return copy(started === sessionRevision ? session : data.session.get(id))
      },
      message: {
        ...client.session.message,
        get: (request, init) => read(client.session.message.get(request, options(init))),
      },
      inbox: {
        ...client.session.inbox,
        list: (request, init) => read(client.session.inbox.list(request, options(init))),
      },
    },
    model: { ...client.model, list: (request, init) => read(client.model.list(request, options(init))) },
    provider: {
      ...client.provider,
      list: (request, init) => read(client.provider.list(request, options(init))),
    },
    integration: {
      ...client.integration,
      list: (request, init) => read(client.integration.list(request, options(init))),
    },
    agent: { ...client.agent, list: (request, init) => read(client.agent.list(request, options(init))) },
    command: {
      ...client.command,
      list: (request, init) => read(client.command.list(request, options(init))),
    },
    skill: { ...client.skill, list: (request, init) => read(client.skill.list(request, options(init))) },
    message: {
      ...client.message,
      async list(request, init) {
        const started = revision
        const response = await read(client.message.list(request, options(init)))
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
  // A 404 evicts the shared session before deleted-session recovery opens the next draft.
  const directory = createMemo(() => data.session.get(id)?.location.directory)
  const shells = createMemo(() => {
    const root = directory()
    if (!root) return
    return createSessionShells({
      directory: root,
      api: input.client.shell,
      inventory: data.shell,
      reads: shellReads,
      signal: input.signal,
      publish: publishEvent,
    })
  })
  const view = (): SessionDataView => {
    const sessionPending = pending.list()
    return {
      session: data.session.get(id),
      sessionMessages: cache.messages(sessionPending),
      sessionPending,
      sessionStatus: local.status ?? (data.session.status(id) === "running" ? { type: "busy" } : { type: "idle" }),
    }
  }
  function pendingStatus(messageID: string): DataPendingStatus | "sending" | undefined {
    const item = pending.get(messageID)
    if (!item) return cache.sending(messageID) ? "sending" : undefined
    if (item.type !== "user") return
    if (item.delivery === "queue") return "queued"
    const status = data.session.pending.status(id, messageID)
    if (status && status !== "queued") return status

    // An HTTP admission or promotion can precede its inbox event. Classify it against
    // the same idle boundary, using the compact view of delivered and pending inputs.
    const rows = cache.messages()
    const boundary = rows.findLastIndex((row) => row.type === "idle")
    if (data.session.status(id) === "idle")
      return boundary >= 0 && item.time.created <= rows[boundary].time.created ? "stranded" : "starting"
    return rows.slice(boundary + 1).some((row) => row.type === "user" && cache.deliveredPrompt(row.id))
      ? "steering"
      : "starting"
  }
  onCleanup(() => listeners.clear())

  return {
    data,
    events,
    view,
    messages: cache.messages,
    revision: () => revision,
    acknowledgePending: pending.acknowledge,
    mutations: {
      shells,
      statusRevision: () => statusRevision,
      pendingRevision: pending.revision,
      pendingStatus,
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
      admitted: cache.admitted,
      deliveredPrompt: cache.deliveredPrompt,
      echo: cache.echo,
      dropEcho: cache.dropEcho,
      updatePending(update: (items: SessionInboxInfo[]) => SessionInboxInfo[]) {
        const before = pending.list()
        const next = update(before)
        revision++
        batch(() => {
          cache.pendingChanged(pending.replace(before, next, revision), revision)
        })
      },
      apply(event: OpenCodeEvent) {
        if (input.signal.aborted || event.type === "server.connected") return false
        if (event.type === "shell.created" || event.type === "shell.exited" || event.type === "shell.deleted")
          return shells()?.apply(event) ?? false
        if (!event.type.startsWith("session.")) return false
        if ("sessionID" in event.data && event.data.sessionID !== id) return false
        revision++
        if (
          [
            "session.agent.selected",
            "session.model.selected",
            "session.moved",
            "session.renamed",
            "session.usage.updated",
            "session.permissions",
            "session.revert.staged",
            "session.revert.cleared",
            "session.revert.committed",
          ].includes(event.type)
        )
          sessionRevision++
        const needsRefresh = batch(() => {
          if (event.type.startsWith("session.execution.")) {
            statusRevision++
            setLocal("status", undefined)
          }
          const inbox = pending.apply(event, revision)
          const missing = !inbox?.superseded && cache.apply(event, revision, inbox?.delivered)
          publishEvent(event)
          return missing || inbox?.refresh
        })
        if (
          needsRefresh ||
          (event.type === "session.inbox.delivered" && !data.session.message.get(id, event.data.inboxID))
        )
          input.refresh()
        return true
      },
    },
  }
}
