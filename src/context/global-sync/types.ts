import type { Message, Part, QuestionV2Request as QuestionRequest, SessionStatus } from "@opencode-ai/client"
import type { ModelSelection } from "@/context/local-storage"
import type { ModelLoadStatus, ModelOption } from "@/context/models-store"
import type { PromptAttachment } from "@/context/prompt-state-storage"
import type { ServerInfo } from "@/context/server-resolver"
import type { Session } from "@/context/session-directory"
import type { PermissionRequestView } from "@/pages/session/composer/session-request-tree"

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
  prompt: string
  attachments: PromptAttachment[]
  submitting: boolean
  error: string
}
