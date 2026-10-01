import { batch, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { State } from "@/runtime/server/global-sync/types"
import { AGENT_DEFAULT_CONFIG } from "@/new-session/agent-default-config"
import { translateSync } from "@/runtime/i18n/language"
import type { OpencodeClient } from "@/runtime/server/client-compact"
import type { SessionStatus } from "@opencode/client/promise"
import { createSessionRuntime, type SessionRuntime } from "./runtime"
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
let activation = 0

export const currentRuntime = runtime

export type ActiveSession = {
  client: OpencodeClient
  sessionID: string
  localAgent: string
}

export function setSessionClient(next: OpencodeClient | undefined, session = state.session) {
  const version = ++activation
  runtime()?.dispose()
  setRuntime(undefined)
  client = next
  if (!next || !session) return
  // A store setter merges object values. Clear the old view before attaching the new
  // shared object, otherwise the outgoing activation could be mutated in place.
  setState("session", undefined)
  const nextRuntime = createSessionRuntime({
    client: next,
    session,
    changed(view) {
      if (version !== activation || !runtime()?.alive()) return
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
      if (version === activation && runtime()?.alive()) setState("error", readableError(error))
    },
  })
  setRuntime(nextRuntime)
  nextRuntime.publish()
}

export function updateSession(
  update: (session: NonNullable<typeof state.session>) => NonNullable<typeof state.session>,
) {
  if (state.session) runtime()?.setSession(update(state.session))
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
