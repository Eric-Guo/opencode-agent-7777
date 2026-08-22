import type { ModelSelection } from "@/runtime/persistence/storage-compact"
import type { ModelLoadStatus, ModelOption } from "@/providers/models/store-compact"
import type { ServerInfo } from "@/runtime/server/resolver-compact"
import type {
  FormInfo,
  PermissionRequest,
  SessionInfo,
  SessionMessageInfo,
  SessionStatus,
} from "@opencode-ai/client/promise"

export type LoadStatus = "loading" | "ready" | "failed"

export type State = {
  status: LoadStatus
  modelStatus: ModelLoadStatus
  server: ServerInfo | undefined
  session: SessionInfo | undefined
  recentSessions: SessionInfo[]
  recentSessionsLoading: boolean
  recentSessionSwitchingID: string | undefined
  sessionStatus: SessionStatus
  sessionMessages: SessionMessageInfo[]
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
