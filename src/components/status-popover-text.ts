import type { SessionStatus } from "@opencode-ai/client"
import { statusPopoverBodyText } from "@/components/status-popover-body-text"
import type { TranslationKey, TranslationParams } from "@/context/language"
import { state } from "@/context/server-session-store"

// Header status text only; the compact shell does not render the main app's status popover.

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
