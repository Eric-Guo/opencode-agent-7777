// Compact shell classes and header composition, not the main app's route-keyed panel layout.
import type { SessionStatus } from "@opencode-ai/client/promise"
import { createMemo } from "solid-js"
import type { LoadStatus } from "@/runtime/server/global-sync/types"
import { useLanguage, type TranslationKey, type TranslationParams } from "@/runtime/i18n/language"
import { state } from "@/runtime/server/session-store-compact"
import { createNewSessionController } from "@/new-session/controller-compact"

export const SESSION_ROUTE_FRAME_CLASS =
  "grid h-full w-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] bg-v2-background-bg-deep text-v2-text-text-base"

export const SESSION_MESSAGE_SCROLLER_CLASS =
  "min-h-0 overflow-y-auto px-11 pb-7 pt-6 scroll-smooth max-[720px]:px-[18px] max-[720px]:py-4"

export const SESSION_LOADING_STATE_CLASS =
  "flex min-h-full flex-col items-center justify-center gap-3 text-v2-text-text-muted"

export const SESSION_EMPTY_STATE_CLASS =
  "flex min-h-full flex-col items-center justify-center gap-3 text-v2-text-text-muted"

export const SESSION_EMPTY_BADGE_CLASS =
  "flex h-16 w-16 items-center justify-center rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 font-[760] text-v2-text-text-accent"

export function compactSessionStatusText(
  t: (key: TranslationKey, params?: TranslationParams) => string,
  input: { status: LoadStatus; submitting: boolean; sessionStatus: SessionStatus },
) {
  if (input.status === "loading") return t("session.status.starting")
  if (input.status === "failed") return t("session.status.offline")
  if (input.submitting) return t("session.status.sending")
  if (input.sessionStatus.type === "busy") return t("session.status.working")
  if (input.sessionStatus.type === "retry") {
    return t("session.status.retry", { attempt: input.sessionStatus.attempt })
  }
  return t("session.status.ready")
}

export function useSessionLayout(input: { userDialogCount: () => number }) {
  const language = useLanguage()
  const newSession = createNewSessionController()
  const header = createMemo(() => ({
    status: compactSessionStatusText(language.t, {
      status: state.status,
      submitting: state.submitting,
      sessionStatus: state.sessionStatus,
    }),
    userDialogCount: input.userDialogCount(),
    newSessionPending: newSession.pending(),
    newSessionDisabled: newSession.disabled(),
    onNewSession: newSession.create,
  }))

  return {
    language,
    header,
  }
}
