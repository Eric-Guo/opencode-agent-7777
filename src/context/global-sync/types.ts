import type { ModelSelection } from "@/context/local-storage"
import type { ModelLoadStatus, ModelOption } from "@/context/models-store"
import type { ServerInfo } from "@/context/server-resolver"
import type { PermissionRequestView } from "@/pages/session/composer/session-request-tree"
import type { Message, Part, QuestionRequest, Session, SessionStatus } from "@/types"

export type LoadStatus = "loading" | "ready" | "failed"

export type HistoryItem = {
  info: Message
  parts: Part[]
}

export type State = {
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
  submitting: boolean
  error: string
}
