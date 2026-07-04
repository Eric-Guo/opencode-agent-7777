import { Spinner } from "@opencode-ai/ui/spinner"
import { onCleanup, onMount, Show } from "solid-js"
import { SessionHeader } from "@/components/session"
import { useLanguage } from "@/context/language"
import { disposeSessionSync, initializeSessionSync } from "@/context/server-sync"
import { state, statusText } from "@/context/server-session"
import { createNewSessionController } from "@/pages/new-session"
import { ErrorBanner } from "@/pages/error"
import { createSessionComposerRegionController, SessionComposerRegion } from "@/pages/session/composer"
import { createTimelineAutoScroll } from "@/pages/session/helpers"
import { MessageTimeline } from "@/pages/session/timeline/message-timeline"
import { createTimelineModel } from "@/pages/session/timeline/model"

export function SessionPage() {
  let messageList: HTMLDivElement | undefined
  const language = useLanguage()
  const timeline = createTimelineModel({ messages: () => state.messages })
  const composer = createSessionComposerRegionController()
  const newSession = createNewSessionController()

  createTimelineAutoScroll({
    items: timeline.visibleMessages,
    container: () => messageList,
  })

  onMount(() => {
    void initializeSessionSync()
    onCleanup(disposeSessionSync)
  })

  return (
    <div class="grid h-full w-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] bg-v2-background-bg-deep text-v2-text-text-base">
      <SessionHeader
        status={statusText(language.t)}
        userDialogCount={timeline.userDialogCount()}
        newSessionPending={newSession.pending()}
        newSessionDisabled={newSession.disabled()}
        onNewSession={newSession.create}
      />

      <main
        class="min-h-0 overflow-y-auto px-11 pb-7 pt-6 scroll-smooth max-[720px]:px-[18px] max-[720px]:py-4"
        ref={messageList}
      >
        <Show
          when={state.status !== "loading"}
          fallback={
            <div class="flex min-h-full flex-col items-center justify-center gap-3 text-v2-text-text-muted">
              <Spinner class="h-6 w-6" />
              <span>{language.t("session.loading")}</span>
            </div>
          }
        >
          <Show
            when={timeline.visibleMessages().length > 0}
            fallback={
              <div class="flex min-h-full flex-col items-center justify-center gap-3 text-v2-text-text-muted">
                <div class="flex h-16 w-16 items-center justify-center rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 font-[760] text-v2-text-text-accent">
                  7777
                </div>
                <p class="m-0 text-[13px]">{language.t("session.empty")}</p>
              </div>
            }
          >
            <MessageTimeline messages={timeline.visibleMessages()} />
          </Show>
        </Show>
      </main>

      <Show when={state.error}>{(error) => <ErrorBanner error={error()} />}</Show>

      <SessionComposerRegion controller={composer} />
    </div>
  )
}

export default SessionPage
