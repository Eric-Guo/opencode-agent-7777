import type { ModelSelection } from "@/context/local-storage"
import type { ModelLoadStatus, ModelOption } from "@/context/models-store"
import type { ServerInfo } from "@/context/server-resolver"
import type { FormInfo, PermissionRequest, SessionInfo, SessionStatus } from "@opencode-ai/client/promise"
import type { Message, Part } from "@/types"

export type LoadStatus = "loading" | "ready" | "failed"

export type HistoryItem = {
  info: Message
  parts: Part[]
}

export type State = {
  status: LoadStatus
  modelStatus: ModelLoadStatus
  server: ServerInfo | undefined
  session: SessionInfo | undefined
  recentSessions: SessionInfo[]
  recentSessionsLoading: boolean
  recentSessionSwitchingID: string | undefined
  sessionStatus: SessionStatus
  messages: HistoryItem[]
  messagesLoading: boolean
  models: ModelOption[]
  selectedModel: ModelSelection | undefined
  permission: Record<string, PermissionRequest[] | undefined>
  permissionResponding: string | undefined
  form: Record<string, FormInfo[] | undefined>
  questionResponding: string | undefined
  submitting: boolean
  error: string
}
