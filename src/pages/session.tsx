import { Spinner } from "@opencode-ai/ui/spinner"
import { DataProvider } from "@opencode-ai/session-ui/context"
import type { UserActions } from "@opencode-ai/session-ui/message-part"
import type { Part } from "@opencode-ai/sdk"
import { createMemo, onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { SessionHeader } from "@/components/session"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { useLanguage } from "@/context/language"
import { writePromptDraft } from "@/context/local"
import { disposeSessionSync, initializeSessionSync } from "@/context/server-sync"
import {
  currentSession,
  refreshMessages,
  setState,
  state,
  statusText,
  type PromptAttachment,
} from "@/context/server-session"
import { createNewSessionController } from "@/pages/new-session"
import { ErrorBanner } from "@/pages/error"
import { createSessionComposerRegionController, SessionComposerRegion } from "@/pages/session/composer"
import { createTimelineAutoScroll } from "@/pages/session/helpers"
import { MessageTimeline } from "@/pages/session/timeline/message-timeline"
import { createTimelineModel } from "@/pages/session/timeline/model"
import { readableError } from "@/utils/server-errors"

type SessionUiData = ComponentProps<typeof DataProvider>["data"]

function promptTextFromParts(parts: Part[]) {
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .filter((part) => !part.synthetic && !part.ignored)
    .reduce((best: Extract<Part, { type: "text" }> | undefined, part) => {
      if (!best) return part
      return part.text.length > best.text.length ? part : best
    }, undefined)
  return text?.text ?? ""
}

function promptAttachmentsFromParts(parts: Part[]): PromptAttachment[] {
  return parts
    .filter((part): part is Extract<Part, { type: "file" }> => part.type === "file")
    .filter((part) => !part.source)
    .map((part) => ({
      id: part.id,
      filename: part.filename ?? "attachment",
      mime: part.mime,
      url: part.url,
    }))
}

function promptDraftFromParts(parts: Part[]) {
  return {
    text: promptTextFromParts(parts),
    attachments: promptAttachmentsFromParts(parts),
  }
}

export function SessionPage() {
  let messageList: HTMLDivElement | undefined
  const language = useLanguage()
  const timeline = createTimelineModel({
    messages: () => state.messages,
    loading: () => state.messagesLoading,
    revertMessageID: () => state.session?.revert?.messageID,
  })
  const composer = createSessionComposerRegionController()
  const newSession = createNewSessionController()
  const sessionUiData = createMemo(
    () =>
      ({
        session: state.session ? [state.session] : [],
        session_status: state.session ? { [state.session.id]: state.sessionStatus } : {},
        session_diff: {},
        message: state.session ? { [state.session.id]: state.messages.map((item) => item.info) } : {},
        part: Object.fromEntries(state.messages.map((item) => [item.info.id, item.parts])),
      }) as SessionUiData,
  )
  const actions: UserActions = {
    revert: (input) => {
      const active = currentSession()
      if (!active) return
      const message = state.messages.find((item) => item.info.id === input.messageID)
      const draft = message ? promptDraftFromParts(message.parts) : undefined
      setState("error", "")
      return active.client.session
        .revert({
          path: { id: active.sessionID },
          body: { messageID: input.messageID },
        })
        .then((result) => {
          if (result.data) setState("session", result.data)
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
          when={state.status !== "loading" && timeline.ready()}
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
            <DataProvider data={sessionUiData()} directory={state.session?.directory ?? ""}>
              <MessageTimeline messages={timeline.visibleMessages()} actions={actions} />
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
