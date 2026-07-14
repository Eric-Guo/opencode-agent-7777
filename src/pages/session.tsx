import { Spinner } from "@opencode-ai/ui/spinner"
import { DataProvider } from "@opencode-ai/session-ui/context"
import type { UserActions } from "@opencode-ai/session-ui/message-part"
import { createMemo, createSignal, onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { SessionHeader } from "@/components/session"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { refreshMessages } from "@/context/global-sync/session-cache"
import { writePromptDraft } from "@/context/prompt"
import {
  readShowReasoningSummaries,
  readShowToolsPart,
  writeShowReasoningSummaries,
  writeShowToolsPart,
} from "@/context/settings"
import { disposeSessionSync, initializeSessionSync } from "@/context/server-sync"
import { currentSession, setState, state } from "@/context/server-session"
import { ErrorBanner } from "@/pages/error"
import { AgentWelcome } from "@/pages/session/agent-welcome"
import { createSessionComposerRegionController, SessionComposerRegion } from "@/pages/session/composer"
import { NEW_SESSION_EMPTY_BADGE_CLASS, NEW_SESSION_EMPTY_STATE_CLASS } from "@/pages/session/new-session-layout"
import {
  SESSION_LOADING_STATE_CLASS,
  SESSION_MESSAGE_SCROLLER_CLASS,
  SESSION_ROUTE_FRAME_CLASS,
  useSessionLayout,
} from "@/pages/session/session-layout"
import { MessageTimeline } from "@/pages/session/timeline/message-timeline"
import { createTimelineModel } from "@/pages/session/timeline/model"
import { useSessionHashScroll } from "@/pages/session/use-session-hash-scroll"
import { extractPromptFromParts } from "@/utils/prompt"
import { readableError } from "@/utils/server-errors"
import { sessionDirectory } from "@/context/session-directory"

type SessionUiData = ComponentProps<typeof DataProvider>["data"]

export function SessionPage() {
  let messageList: HTMLDivElement | undefined
  let timelinePointerGesture = 0
  const timelinePointerGestureWindowMs = 250
  const timeline = createTimelineModel({
    messages: () => state.messages,
    loading: () => state.messagesLoading,
    revertMessageID: () => state.session?.revert?.messageID,
    status: () => state.sessionStatus,
  })
  const composer = createSessionComposerRegionController()
  const [showReasoningSummaries, setShowReasoningSummaries] = createSignal(readShowReasoningSummaries())
  const [showToolsPart, setShowToolsPart] = createSignal(readShowToolsPart())
  const layout = useSessionLayout({
    userDialogCount: timeline.userDialogCount,
  })
  const sessionUiData = createMemo(
    () =>
      ({
        session: state.session ? [state.session] : [],
        session_status: state.session ? { [state.session.id]: state.sessionStatus } : {},
        session_diff: {},
        message: state.session ? { [state.session.id]: state.messages.map((item) => item.info) } : {},
        part: Object.fromEntries(state.messages.map((item) => [item.info.id, item.parts])),
      }) as unknown as SessionUiData,
  )
  const actions: UserActions = {
    revert: (input) => {
      const active = currentSession()
      if (!active) return
      const message = state.messages.find((item) => item.info.id === input.messageID)
      const draft = message ? extractPromptFromParts(message.parts) : undefined
      setState("error", "")
      return active.client.session.revert
        .stage({ sessionID: active.sessionID, messageID: input.messageID })
        .then((result) => {
          setState("session", "revert", result)
          if (draft) {
            setState("prompt", draft.text)
            setState("attachments", draft.attachments)
            writePromptDraft({ prompt: draft.text, attachments: draft.attachments })
          }
          return refreshMessages(FETCH_MESSAGE_LIMIT)
        })
        .catch((error) => setState("error", readableError(error)))
    },
  }

  useSessionHashScroll({
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

  const toggleToolsPart = () => {
    const next = !showToolsPart()
    setShowToolsPart(next)
    writeShowToolsPart(next)
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
        showToolsPart={showToolsPart()}
        onToggleReasoningSummaries={toggleReasoningSummaries}
        onToggleToolsPart={toggleToolsPart}
      />

      <main class={SESSION_MESSAGE_SCROLLER_CLASS} ref={messageList}>
        <Show
          when={state.status !== "loading" && timeline.ready()}
          fallback={
            <div class={SESSION_LOADING_STATE_CLASS}>
              <Spinner class="h-6 w-6" />
              <span>{layout.language.t("session.loading")}</span>
            </div>
          }
        >
          <Show
            when={timeline.visibleMessages().length > 0}
            fallback={
              <div class={NEW_SESSION_EMPTY_STATE_CLASS}>
                <Show
                  when={state.session?.id === state.welcomeSessionID}
                  fallback={
                    <>
                      <div class={NEW_SESSION_EMPTY_BADGE_CLASS}>7777</div>
                      <p class="m-0 text-[13px]">{layout.language.t("session.empty")}</p>
                    </>
                  }
                >
                  <AgentWelcome />
                </Show>
              </div>
            }
          >
            <DataProvider data={sessionUiData()} directory={state.session ? sessionDirectory(state.session) : ""}>
              <MessageTimeline
                rows={timeline.visibleRows()}
                actions={actions}
                showReasoningSummaries={showReasoningSummaries()}
                showToolsPart={showToolsPart()}
                sessionStatus={state.sessionStatus}
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
