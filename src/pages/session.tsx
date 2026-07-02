import { Spinner } from "@opencode-ai/ui/spinner"
import { createEffect, onCleanup, onMount, Show } from "solid-js"
import { SessionHeader } from "@/components/session"
import { selectModel } from "@/context/models"
import { decidePermission } from "@/context/permission"
import { disposeSessionSync, initializeSessionSync, statusText } from "@/context/server-sync"
import { setState, state } from "@/context/sync"
import { ErrorBanner } from "@/pages/error"
import {
  abortPrompt,
  addAttachment,
  createPromptInputController,
  removeAttachment,
  SessionComposerRegion,
  setPrompt,
  submitPrompt,
} from "@/pages/session/composer"
import { MessageTimeline } from "@/pages/session/timeline/message-timeline"
import { createTimelineModel } from "@/pages/session/timeline/model"

export function SessionPage() {
  let messageList: HTMLDivElement | undefined
  const timeline = createTimelineModel({ messages: () => state.messages })
  const promptInput = createPromptInputController()

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
    <div class="grid h-full w-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] bg-[#111112]">
      <SessionHeader status={statusText()} userDialogCount={timeline.userDialogCount()} />

      <main
        class="min-h-0 overflow-y-auto px-11 pb-7 pt-6 scroll-smooth max-[720px]:px-[18px] max-[720px]:py-4"
        ref={messageList}
      >
        <Show
          when={state.status !== "loading"}
          fallback={
            <div class="flex min-h-full flex-col items-center justify-center gap-3 text-[#8b8d91]">
              <Spinner class="h-6 w-6" />
              <span>Starting 7777</span>
            </div>
          }
        >
          <Show
            when={timeline.visibleMessages().length > 0}
            fallback={
              <div class="flex min-h-full flex-col items-center justify-center gap-3 text-[#8b8d91]">
                <div class="flex h-16 w-16 items-center justify-center rounded-lg border border-[#303236] bg-[#171819] font-[760] text-[#22d1bd]">
                  7777
                </div>
                <p class="m-0 text-[13px]">Ready</p>
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
        attachments={state.attachments}
        disabled={state.status !== "ready"}
        busy={promptInput.busy()}
        canSubmit={promptInput.canSubmit()}
        models={state.models}
        selectedModel={state.selectedModel}
        modelStatus={state.modelStatus}
        permissionRequest={state.permissionRequest}
        permissionResponding={state.permissionResponding}
        onPromptChange={setPrompt}
        onAttachmentAdd={addAttachment}
        onAttachmentRemove={removeAttachment}
        onAttachmentError={(message) => setState("error", message)}
        onModelSelect={selectModel}
        onPermissionDecide={decidePermission}
        onSubmit={submitPrompt}
        onAbort={abortPrompt}
      />
    </div>
  )
}

export default SessionPage
