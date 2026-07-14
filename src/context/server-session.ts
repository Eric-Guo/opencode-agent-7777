import type { QuestionV2Request as QuestionRequest, SessionStatus } from "@opencode-ai/client"
import { createStore } from "solid-js/store"
import { translateSync } from "@/context/language"
import type { ModelSelection } from "@/context/local"
import type { ModelLoadStatus, ModelOption } from "@/context/models"
import type { PromptAttachment } from "@/context/prompt"
import type { PermissionRequestView } from "@/pages/session/composer/session-request-tree"
import type { OpencodeClient } from "@/context/server-sdk"
import type { ServerInfo } from "@/context/server"
import type { HistoryItem } from "@/context/global-sync/session-cache"
import type { Session } from "@/context/session-directory"

export type LoadStatus = "loading" | "ready" | "failed"

export type AppState = {
  status: LoadStatus
  modelStatus: ModelLoadStatus
  server: ServerInfo | undefined
  session: Session | undefined
  recentSessions: Session[]
  recentSessionsLoading: boolean
  recentSessionSwitchingID: string | undefined
  sessionStatus: SessionStatus
  messages: HistoryItem[]
  messagesLoading: boolean
  models: ModelOption[]
  selectedModel: ModelSelection | undefined
  permissionRequest: PermissionRequestView | undefined
  permissionResponding: boolean
  questionRequest: QuestionRequest | undefined
  questionResponding: boolean
  prompt: string
  attachments: PromptAttachment[]
  submitting: boolean
  welcomeSessionID: string | undefined
  error: string
}

export const idleStatus = { type: "idle" } satisfies SessionStatus

export const [state, setState] = createStore<AppState>({
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
  }
}
