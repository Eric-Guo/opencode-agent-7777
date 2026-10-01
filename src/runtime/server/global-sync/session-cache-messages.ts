// Compact orchestration around the activation-owned shared data layer.
import type { SessionInboxInfo, SessionMessageInfo } from "@opencode/client/promise"
import { currentRuntime } from "@/runtime/server/session-store-compact"

export const pendingInboxRevision = () => currentRuntime()?.pendingRevision() ?? 0
export const updatePendingInbox = (update: (items: SessionInboxInfo[]) => SessionInboxInfo[]) =>
  currentRuntime()?.updatePending(update)
export const echoPendingUserMessage = (message: SessionMessageInfo) => currentRuntime()?.echo(message)
export const dropPendingEcho = (messageID: string) => currentRuntime()?.dropEcho(messageID)
export const refreshMessages = (limit: number) => currentRuntime()?.refreshMessages(limit) ?? Promise.resolve()
