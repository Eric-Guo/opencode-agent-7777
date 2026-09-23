import { Spinner } from "@opencode/ui/spinner"
import { DataProvider } from "@opencode/session-ui/context"
import { createMemo, onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { SessionHeader } from "@/session/header/session-header"
import { useSettings } from "@/settings/model"
import { ComposerDropzone } from "@/composer/dropzone"
import { disposeSessionSync, initializeSessionSync } from "@/runtime/server/sync-session-compact"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"
import { ErrorBanner } from "@/shell/errors/banner-compact"
import { AgentWelcome } from "@/session/agent-welcome-compact"
import { createActiveSessionRegion, ActiveSessionComposerRegion } from "@/session/composer/region"
import {
  SESSION_EMPTY_STATE_CLASS,
  SESSION_LOADING_STATE_CLASS,
  SESSION_MESSAGE_SCROLLER_CLASS,
  SESSION_ROUTE_FRAME_CLASS,
  useSessionLayout,
} from "@/session/screen-layout-compact"
import { CompactMessageTimeline } from "@/session/timeline/message-timeline-compact"
import { createCompactTimelineModel } from "@/session/timeline/model-compact"
import { createSessionTimelineInteraction } from "@/session/timeline/interaction"
import { sessionDirectory } from "@/session/directory"

type SessionUiData = ComponentProps<typeof DataProvider>["data"]

export function SessionPage() {
  const settings = useSettings()
  const timeline = createCompactTimelineModel({
    sessionID: () => state.session?.id ?? "",
    messages: () => state.sessionMessages,
    loading: () => state.messagesLoading,
    revertMessageID: () => state.session?.revert?.messageID,
    status: () => state.sessionStatus,
  })
  const region = createActiveSessionRegion()
  const layout = useSessionLayout({
    userDialogCount: timeline.userDialogCount,
  })
  const sessionUiData = createMemo(
    (): SessionUiData => ({
      session: state.session ? [state.session] : [],
      session_status: state.session ? { [state.session.id]: state.sessionStatus } : {},
      session_diff: {},
    }),
  )

  const interaction = createSessionTimelineInteraction({
    items: timeline.visibleMessages,
  })

  const toggleReasoningSummaries = () => {
    settings.general.setShowReasoningSummaries(!settings.general.showReasoningSummaries())
  }

  onMount(() => {
    void initializeSessionSync()
    onCleanup(disposeSessionSync)
  })

  return (
    <div class={SESSION_ROUTE_FRAME_CLASS}>
      <ComposerDropzone active={region.active.drop.active()} identity={() => state.session?.id} />
      <SessionHeader
        {...layout.header()}
        revert={region.actions.revert}
        showReasoningSummaries={settings.general.showReasoningSummaries()}
        onToggleReasoningSummaries={toggleReasoningSummaries}
      />

      <main
        data-slot="session-message-scroller"
        class={SESSION_MESSAGE_SCROLLER_CLASS}
        ref={interaction.view.setScrollRef}
      >
        <Show
          when={state.status !== "loading" && timeline.ready()}
          fallback={
            <div class={SESSION_LOADING_STATE_CLASS}>
              <Spinner class="h-6 w-6" />
              <span>{layout.language.t("session.loading", { agent: currentLocalAgent() })}</span>
            </div>
          }
        >
          <Show
            when={timeline.visibleMessages().length > 0}
            fallback={
              <div class={SESSION_EMPTY_STATE_CLASS}>
                <AgentWelcome />
              </div>
            }
          >
            <DataProvider data={sessionUiData()} directory={state.session ? sessionDirectory(state.session) : ""}>
              <CompactMessageTimeline
                document={timeline.document()}
                actions={region.actions.timeline}
                showReasoningSummaries={settings.general.showReasoningSummaries()}
                onPointerGesture={interaction.view.markUserScroll}
              />
            </DataProvider>
          </Show>
        </Show>
      </main>

      <Show when={state.error}>{(error) => <ErrorBanner error={error()} />}</Show>

      <ActiveSessionComposerRegion model={region.active} />
    </div>
  )
}

export default SessionPage
