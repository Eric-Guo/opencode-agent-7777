import { batch, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { State } from "@/runtime/server/global-sync/types"
import { AGENT_DEFAULT_CONFIG } from "@/new-session/agent-default-config"
import { createSessionDraft } from "@/new-session/draft"
import { translateSync } from "@/runtime/i18n/language"
import type { OpencodeClient } from "@/runtime/server/client-compact"
import type { SessionStatus } from "@opencode/client/promise"
import { createSessionRuntime, type SessionRuntime } from "./runtime"
import { createLoadState, transitionLoad } from "./load-machine"
import { readableError } from "@/shell/errors/readable"

// Compact single-session UI store; prompt draft state lives in composer/state.ts.

export type { LoadStatus } from "@/runtime/server/global-sync/types"

export const idleStatus = Object.freeze({ type: "idle" } satisfies SessionStatus)

export const [state, setState] = createStore<State>({
  status: "loading",
  eventsConnected: false,
  modelStatus: "loading",
  server: undefined,
  session: undefined,
  recentSessions: [],
  recentSessionsLoading: false,
  recentSessionSwitchingID: undefined,
  sessionStatus: { ...idleStatus },
  sessionMessages: [],
  sessionPending: [],
  messagesLoading: false,
  models: [],
  selectedModel: undefined,
  agentModels: {},
  permission: {},
  permissionResponding: undefined,
  form: {},
  questionResponding: undefined,
  submitting: false,
  error: "",
})

let client: OpencodeClient | undefined
const [runtime, setRuntime] = createSignal<SessionRuntime>()
const [draft, setDraft] = createSignal<ReturnType<typeof createSessionDraft>>()
let attachment = createLoadState()

export const currentRuntime = runtime
export const currentDraft = draft
export const currentDirectory = () => state.session?.location.directory ?? draft()?.directory
export const currentData = () => runtime()?.data ?? draft()?.data

export type ActiveSession = {
  client: OpencodeClient
  sessionID: string
  localAgent: string
}

export function setSessionClient(next: OpencodeClient | undefined, session = state.session) {
  attachment = transitionLoad(attachment, { type: "started" })
  const attempt = attachment.attempt
  draft()?.dispose()
  setDraft(undefined)
  runtime()?.dispose()
  setRuntime(undefined)
  client = next
  if (!next || !session) {
    attachment = transitionLoad(attachment, { type: "disposed" })
    return
  }
  // A store setter merges object values. Clear the old view before attaching the new
  // shared object, otherwise the outgoing activation could be mutated in place.
  setState("session", undefined)
  const nextRuntime = createSessionRuntime({
    client: next,
    session,
    changed(view) {
      if (attempt !== attachment.attempt || !runtime()?.alive()) return
      batch(() => {
        if (state.session !== view.session) {
          setState("session", undefined)
          setState("session", () => view.session)
        }
        setState("sessionMessages", view.sessionMessages)
        setState("sessionPending", view.sessionPending)
        setState("sessionStatus", reconcile({ ...view.sessionStatus }))
        setState("messagesLoading", view.messagesLoading)
      })
    },
    error(error) {
      if (attempt === attachment.attempt && runtime()?.alive()) setState("error", readableError(error))
    },
  })
  attachment = transitionLoad(attachment, { type: "succeeded", attempt })
  setRuntime(nextRuntime)
  nextRuntime.publish()
}

export function setSessionDraft(api: OpencodeClient, directory: string) {
  batch(() => {
    setSessionClient(undefined)
    setState({
      session: undefined,
      sessionMessages: [],
      sessionPending: [],
      messagesLoading: false,
      recentSessionSwitchingID: undefined,
      recentSessionsLoading: false,
      submitting: false,
      eventsConnected: false,
      permissionResponding: undefined,
      questionResponding: undefined,
      error: "",
    })
    setState("sessionStatus", reconcile({ ...idleStatus }))
    setState("permission", reconcile({}))
    setState("form", reconcile({}))
    setDraft(createSessionDraft(api, directory))
  })
}

export function setSessionStatus(status: SessionStatus) {
  runtime()?.setStatus(status)
}

export function currentLocalAgent() {
  return state.server?.localAgent ?? state.session?.agent ?? AGENT_DEFAULT_CONFIG.localAgent
}

export function currentSession(): ActiveSession | undefined {
  if (!client || !state.session) {
    setState("error", translateSync("error.sessionNotReady"))
    return
  }
  return {
    client,
    sessionID: state.session.id,
    localAgent: currentLocalAgent(),
  }
}
