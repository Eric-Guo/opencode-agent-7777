// Compact shell classes and header composition, not the main app's route-keyed panel layout.
import { createMemo } from "solid-js"
import { statusText } from "@/components/status-popover-text"
import { useLanguage } from "@/context/language"
import { createNewSessionController } from "@/pages/new-session-controller"

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

export function useSessionLayout(input: { userDialogCount: () => number }) {
  const language = useLanguage()
  const newSession = createNewSessionController()
  const header = createMemo(() => ({
    status: statusText(language.t),
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
