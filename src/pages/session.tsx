import { Spinner } from "@opencode-ai/ui/spinner"
import { createEffect, createMemo, onCleanup, onMount, Show } from "solid-js"
import { SessionHeader } from "@/components/session"
import {
  abortPrompt,
  disposeSessionSync,
  initializeSessionSync,
  setPrompt,
  state,
  statusText,
  submitPrompt,
} from "@/context/sync"
import { ErrorBanner } from "@/pages/error"
import { SessionComposerRegion } from "@/pages/session/composer"
import { MessageTimeline } from "@/pages/session/timeline/message-timeline"
import { createTimelineModel } from "@/pages/session/timeline/model"

export default function Session() {
  let messageList: HTMLDivElement | undefined
  const timeline = createTimelineModel({ messages: () => state.messages })
  const busy = createMemo(() => state.submitting || state.sessionStatus.type !== "idle")
  const canSubmit = createMemo(() => state.prompt.trim().length > 0 && !state.submitting && state.status === "ready")

  createEffect(() => {
    timeline.visibleMessages().length
    queueMicrotask(() => {
      if (!messageList) return
      messageList.scrollTop = messageList.scrollHeight
    })
  })

  onMount(() => {
    void initializeSessionSync()
    onCleanup(disposeSessionSync)
  })

  return (
    <div class="app-shell">
      <SessionHeader status={statusText(state.sessionStatus)} userDialogCount={timeline.userDialogCount()} />

      <main class="conversation" ref={messageList}>
        <Show
          when={state.status !== "loading"}
          fallback={
            <div class="loading">
              <Spinner class="loading-spinner" />
              <span>Starting 7777</span>
            </div>
          }
        >
          <Show
            when={timeline.visibleMessages().length > 0}
            fallback={
              <div class="empty-state">
                <div class="empty-mark">7777</div>
                <p>Ready</p>
              </div>
            }
          >
            <MessageTimeline messages={timeline.visibleMessages()} />
          </Show>
        </Show>
      </main>

      <Show when={state.error}>{(error) => <ErrorBanner error={error()} />}</Show>

      <SessionComposerRegion
        prompt={state.prompt}
        disabled={state.status !== "ready"}
        busy={busy()}
        canSubmit={canSubmit()}
        onPromptChange={setPrompt}
        onSubmit={submitPrompt}
        onAbort={abortPrompt}
      />
    </div>
  )
}
