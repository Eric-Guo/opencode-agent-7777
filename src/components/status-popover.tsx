import type { SessionStatus } from "@opencode-ai/client"
import { statusPopoverBodyText } from "@/components/status-popover-body"
import type { TranslationKey, TranslationParams } from "@/context/language"
import { state } from "@/context/server-session"

export function statusText(
  t: (key: TranslationKey, params?: TranslationParams) => string,
  status: SessionStatus = state.sessionStatus,
) {
  return statusPopoverBodyText(t, {
    status: state.status,
    submitting: state.submitting,
    sessionStatus: status,
  })
}
