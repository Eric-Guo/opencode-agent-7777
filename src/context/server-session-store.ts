import type { SessionStatus } from "@opencode-ai/client"
import { createStore } from "solid-js/store"
import type { State } from "@/context/global-sync/types"
import { translateSync } from "@/context/language"
import type { OpencodeClient } from "@/context/server-sdk-client"
import { DEFAULT_LOCAL_AGENT } from "@/context/server-resolver"

// Compact single-session UI store; the main app's server-session module owns a multi-session cache.

export type { LoadStatus } from "@/context/global-sync/types"

export const idleStatus = { type: "idle" } satisfies SessionStatus

export const [state, setState] = createStore<State>({
  status: "loading",
  modelStatus: "loading",
  server: undefined,
  session: undefined,
  recentSessions: [],
  recentSessionsLoading: false,
  recentSessionSwitchingID: undefined,
  sessionStatus: idleStatus,
  messages: [],
  messagesLoading: false,
  models: [],
  selectedModel: undefined,
  permissionRequest: undefined,
  permissionResponding: false,
  questionRequest: undefined,
  questionResponding: false,
  prompt: "",
  attachments: [],
  submitting: false,
  welcomeSessionID: undefined,
  error: "",
})

let client: OpencodeClient | undefined

export type ActiveSession = {
  client: OpencodeClient
  sessionID: string
  localAgent: string
}

export function setSessionClient(next: OpencodeClient | undefined) {
  client = next
}

export function currentSession(): ActiveSession | undefined {
  if (!client || !state.session) {
    setState("error", translateSync("error.sessionNotReady"))
    return
  }
  return {
    client,
    sessionID: state.session.id,
    localAgent: state.server?.localAgent ?? state.session.agent ?? DEFAULT_LOCAL_AGENT,
  }
}
