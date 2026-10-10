import type { CreateDataInput, Data } from "@opencode/client/solid"
import type {
  OpenCodeClient,
  OpenCodeEvent,
  SessionInboxInfo,
  SessionInfo,
  SessionMessageInfo,
  SessionStatus,
} from "@opencode/client/promise"
import { createComputed, createRoot, onCleanup, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { FETCH_MESSAGE_LIMIT, HISTORY_DIALOG_LIMIT } from "@/constants/session"
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
    let refresh: Promise<void> | undefined
    let refreshAgain = false
    let initialLimit = FETCH_MESSAGE_LIMIT
    const [state, setState] = createStore({ loading: false })
    const sessionData = createSessionData({
      client: input.client,
      session: input.session,
      signal: abort.signal,
      initialMessageLimit: () => initialLimit,
      refresh: () => schedule(),
      error: input.error,
    })
    const data = sessionData.data
    const view = (): SessionView => ({ ...sessionData.view(), messagesLoading: state.loading })
    const publish = () => {
      const value = view()
      untrack(() => input.changed(value))
    }
    createComputed(publish)
    onCleanup(() => {
      abort.abort()
      clearTimeout(refreshTimer)
    })
    const refreshMessages = (limit = FETCH_MESSAGE_LIMIT): Promise<void> => {
      if (abort.signal.aborted) return Promise.resolve()
      if (refresh) {
        refreshAgain = true
        return refresh
      }
      initialLimit = limit
      setState("loading", true)
      data.session.pending.invalidate(id)
      data.session.message.invalidate(id)
      const run = (async () => {
        do {
          refreshAgain = false
          const started = sessionData.revision()
          await Promise.all([data.session.pending.sync(id), data.session.message.sync(id)])
          sessionData.acknowledgePending(started)
          abort.signal.throwIfAborted()
          while (
            sessionData.messages().filter((row) => row.type === "user" || row.type === "shell").length <
              HISTORY_DIALOG_LIMIT &&
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
        if (!abort.signal.aborted) setState("loading", false)
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
