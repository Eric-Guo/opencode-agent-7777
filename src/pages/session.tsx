import { Spinner } from "@opencode-ai/ui/spinner"
import { DataProvider } from "@opencode-ai/session-ui/context"
import type { UserActions } from "@opencode-ai/session-ui/message-part"
import type { Part } from "@opencode-ai/sdk"
import { createMemo, onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { SessionHeader } from "@/components/session"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { writePromptDraft } from "@/context/local"
import { disposeSessionSync, initializeSessionSync } from "@/context/server-sync"
import {
  currentSession,
  refreshMessages,
  setState,
  state,
  type PromptAttachment,
} from "@/context/server-session"
import { ErrorBanner } from "@/pages/error"
import { createSessionComposerRegionController, SessionComposerRegion } from "@/pages/session/composer"
import {
  NEW_SESSION_EMPTY_BADGE_CLASS,
  NEW_SESSION_EMPTY_STATE_CLASS,
} from "@/pages/session/new-session-layout"
import {
  SESSION_LOADING_STATE_CLASS,
  SESSION_MESSAGE_SCROLLER_CLASS,
  SESSION_ROUTE_FRAME_CLASS,
  useSessionLayout,
} from "@/pages/session/session-layout"
import { MessageTimeline } from "@/pages/session/timeline/message-timeline"
import { createTimelineModel } from "@/pages/session/timeline/model"
import { useSessionHashScroll } from "@/pages/session/use-session-hash-scroll"
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
  const timeline = createTimelineModel({
    messages: () => state.messages,
    loading: () => state.messagesLoading,
    revertMessageID: () => state.session?.revert?.messageID,
  })
  const composer = createSessionComposerRegionController()
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

  useSessionHashScroll({
    items: timeline.visibleMessages,
    container: () => messageList,
  })

  onMount(() => {
    void initializeSessionSync()
    onCleanup(disposeSessionSync)
  })

  return (
    <div class={SESSION_ROUTE_FRAME_CLASS}>
      <SessionHeader {...layout.header()} />

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
                <div class={NEW_SESSION_EMPTY_BADGE_CLASS}>7777</div>
                <p class="m-0 text-[13px]">{layout.language.t("session.empty")}</p>
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
