import type { CreateDataInput, Data } from "@opencode/client/solid"
import type {
  OpenCodeClient,
  OpenCodeEvent,
  SessionInboxInfo,
  SessionInfo,
  SessionMessageInfo,
  SessionStatus,
} from "@opencode/client/promise"
import { createComputed, createMemo, createRoot, createSignal, onCleanup, untrack } from "solid-js"
import { bounded } from "./operation"
import { clearReadError, reportReadError } from "./read-errors"
import { createRefreshState, transitionRefresh, refreshLoading, type RefreshEvent } from "./refresh-machine"
import { FETCH_MESSAGE_LIMIT, HISTORY_DIALOG_LIMIT } from "@/constants/session"
import { isSessionDialogRoot } from "@/session/session-domain"
import { createSessionData, type SessionDataView } from "./data"

export type SessionView = SessionDataView & { messagesLoading: boolean }

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
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const [machine, setMachine] = createSignal(createRefreshState())
    let waiter: ReturnType<typeof Promise.withResolvers<void>> | undefined
    const errorOwner = {}
    const loading = createMemo(() => refreshLoading(machine()))
    const sessionData = createSessionData({
      client: input.client,
      session: input.session,
      signal: abort.signal,
      initialMessageLimit: () => {
        const value = machine()
        return value.status === "loading" ? value.limit : FETCH_MESSAGE_LIMIT
      },
      refresh: () => schedule(),
      error: input.error,
    })
    const data = sessionData.data
    const view = (): SessionView => ({ ...sessionData.view(), messagesLoading: loading() })
    const publish = () => {
      const value = view()
      untrack(() => input.changed(value))
    }
    createComputed(publish)
    const dispatch = (event: RefreshEvent) => {
      const previous = untrack(machine)
      const next = transitionRefresh(previous, event)
      if (next === previous) return
      setMachine(next)
      clearTimeout(refreshTimer)
      if (next.status === "scheduled") {
        refreshTimer = setTimeout(() => {
          void refreshMessages().catch(() => {})
        }, next.delay)
      }
      if (next.status === "loading" && (previous.status !== "loading" || previous.attempt !== next.attempt)) {
        clearReadError(errorOwner)
        data.session.pending.invalidate(id)
        data.session.message.invalidate(id)
        void bounded(
          async (signal) => {
            const started = sessionData.revision()
            await Promise.all([data.session.pending.sync(id), data.session.message.sync(id)])
            signal.throwIfAborted()
            sessionData.acknowledgePending(started)
            while (
              sessionData.messages().filter(isSessionDialogRoot).length < HISTORY_DIALOG_LIMIT &&
              data.session.message.more(id)
            ) {
              await data.session.message.loadMore(id, { signal })
              signal.throwIfAborted()
            }
          },
          { signal: abort.signal },
        ).then(
          () => dispatch({ type: "succeeded", attempt: next.attempt }),
          (error) => dispatch({ type: "failed", attempt: next.attempt, error }),
        )
      }
      if (next.status === "failed") {
        reportReadError(errorOwner, next.error, () => {
          void refreshMessages().catch(() => {})
        })
        waiter?.reject(next.error)
        waiter = undefined
      } else if (next.status === "idle" || next.status === "disposed") {
        waiter?.resolve()
        waiter = undefined
      }
    }
    const refreshMessages = (limit = FETCH_MESSAGE_LIMIT): Promise<void> => {
      if (machine().status === "disposed") return Promise.resolve()
      waiter ??= Promise.withResolvers<void>()
      const promise = waiter.promise
      dispatch({ type: "refresh", limit })
      return promise
    }
    const schedule = (delay = 120) => dispatch({ type: "schedule", delay })
    onCleanup(() => {
      dispatch({ type: "disposed" })
      abort.abort()
      clearReadError(errorOwner)
    })
    return {
      ...sessionData.mutations,
      api: input.client,
      data,
      events: sessionData.events,
      id,
      signal: abort.signal,
      dispose,
      publish,
      view,
      alive: () => !abort.signal.aborted,
      refreshMessages,
      schedule,
    }
  })
}
