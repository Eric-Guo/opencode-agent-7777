import { Spinner } from "@opencode-ai/ui/spinner"
import { DataProvider } from "@opencode-ai/session-ui/context"
import type { SessionUserActions } from "@opencode-ai/session-ui/actions"
import { createMemo, createSignal, onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { SessionHeader } from "@/session/header/session-header"
import { readShowReasoningSummaries, writeShowReasoningSummaries } from "@/runtime/persistence/settings-storage-compact"
import { disposeSessionSync, initializeSessionSync } from "@/runtime/server/sync-session-compact"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"
import { ErrorBanner } from "@/shell/errors/banner-compact"
import { AgentWelcome } from "@/session/agent-welcome-compact"
import { createSessionComposerRegionController } from "@/session/composer/session-composer-region-controller"
import { SessionComposerRegion } from "@/session/composer/session-composer-region"
import {
  SESSION_EMPTY_STATE_CLASS,
  SESSION_LOADING_STATE_CLASS,
  SESSION_MESSAGE_SCROLLER_CLASS,
  SESSION_ROUTE_FRAME_CLASS,
  useSessionLayout,
} from "@/session/screen-layout-compact"
import { CompactMessageTimeline } from "@/session/timeline/message-timeline-compact"
import { createCompactTimelineModel } from "@/session/timeline/model-compact"
import { useSessionHashScrollToEnd } from "@/session/use-session-hash-scroll-to-end"
import { sessionDirectory } from "@/session/directory"
import { createSessionRevert } from "@/session/revert"

type SessionUiData = ComponentProps<typeof DataProvider>["data"]

export function SessionPage() {
  let messageList: HTMLDivElement | undefined
  let timelinePointerGesture = 0
  const timelinePointerGestureWindowMs = 250
  const [showReasoningSummaries, setShowReasoningSummaries] = createSignal(readShowReasoningSummaries())
  const timeline = createCompactTimelineModel({
    sessionID: () => state.session?.id ?? "",
    messages: () => state.sessionMessages,
    loading: () => state.messagesLoading,
    revertMessageID: () => state.session?.revert?.messageID,
    status: () => state.sessionStatus,
  })
  const composer = createSessionComposerRegionController()
  const layout = useSessionLayout({
    userDialogCount: timeline.userDialogCount,
  })
  const revert = createSessionRevert()
  const sessionUiData = createMemo(
    (): SessionUiData => ({
      session: state.session ? [state.session] : [],
      session_status: state.session ? { [state.session.id]: state.sessionStatus } : {},
      session_diff: {},
    }),
  )
  const actions: SessionUserActions = {
    revert: (input) => revert.to(input.messageID),
  }

  useSessionHashScrollToEnd({
    items: timeline.visibleMessages,
    container: () => messageList,
    shouldScrollToEnd: () => Date.now() - timelinePointerGesture >= timelinePointerGestureWindowMs,
  })

  const markTimelinePointerGesture = (target?: EventTarget | null) => {
    const root = messageList
    if (!root) return

    const el = target instanceof Element ? target : undefined
    const nested = el?.closest("[data-scrollable]")
    if (nested && nested !== root) return

    timelinePointerGesture = Date.now()
  }

  const toggleReasoningSummaries = () => {
    const next = !showReasoningSummaries()
    setShowReasoningSummaries(next)
    writeShowReasoningSummaries(next)
  }

  onMount(() => {
    void initializeSessionSync()
    onCleanup(disposeSessionSync)
  })

  return (
    <div class={SESSION_ROUTE_FRAME_CLASS}>
      <SessionHeader
        {...layout.header()}
        showReasoningSummaries={showReasoningSummaries()}
        onToggleReasoningSummaries={toggleReasoningSummaries}
      />

      <main data-slot="session-message-scroller" class={SESSION_MESSAGE_SCROLLER_CLASS} ref={messageList}>
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
                actions={actions}
                showReasoningSummaries={showReasoningSummaries()}
                onPointerGesture={markTimelinePointerGesture}
              />
            </DataProvider>
          </Show>
        </Show>
      </main>

      <Show when={state.error}>{(error) => <ErrorBanner error={error()} />}</Show>

      <SessionComposerRegion controller={composer} />
    </div>
  )
}

export default SessionPage
