import type { SessionStatus } from "@opencode-ai/sdk"
import type { TranslationKey, TranslationParams } from "@/context/language"
import type { LoadStatus } from "@/context/server-session"

export type StatusTextState = {
  status: LoadStatus
  submitting: boolean
  sessionStatus: SessionStatus
}

export function statusPopoverBodyText(
  t: (key: TranslationKey, params?: TranslationParams) => string,
  input: StatusTextState,
) {
  if (input.status === "loading") return t("session.status.starting")
  if (input.status === "failed") return t("session.status.offline")
  if (input.submitting) return t("session.status.sending")
  if (input.sessionStatus.type === "busy") return t("session.status.working")
  if (input.sessionStatus.type === "retry") return t("session.status.retry", { attempt: input.sessionStatus.attempt })
  return t("session.status.ready")
}
