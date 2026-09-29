import { Spinner } from "@opencode/ui/spinner"
import { IconButton } from "@opencode/ui/icon-button"
import { Icon } from "@opencode/ui/icon"
import { DataProvider } from "@opencode/session-ui/context"
import { createMemo, onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { SessionHeader } from "@/session/header/session-header"
import { useSettings } from "@/settings/model"
import { ComposerDropzone } from "@/composer/dropzone"
import { disposeSessionSync, initializeSessionSync } from "@/runtime/server/sync-session-compact"
import { currentLocalAgent, currentRuntime, state } from "@/runtime/server/session-store-compact"
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
import { SHOW_FILE_TREE_PANEL } from "@/constants/session"
import { createSessionFiles, SessionFileTabs, SessionSidePanel } from "@/session/files/session-side-panel"
import { pathToFileUrl } from "@/session/files/file-tree"
import { resolveOpenInAppPath } from "@/session/files/open-in-app-path"
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
  const files = SHOW_FILE_TREE_PANEL ? createSessionFiles() : undefined
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
    identity: currentRuntime,
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

      <div class="session-workspace">
        <Show when={files}>{(model) => <SessionSidePanel model={model()} />}</Show>
        <div class="session-conversation">
          <SessionFileTabs
            model={files}
            disabled={region.active.composer.disabled()}
            onAdd={(path) => {
              region.active.composer.addFile({
                type: "file",
                path,
                content: `@${path}`,
                start: 0,
                end: 0,
                url: pathToFileUrl(resolveOpenInAppPath(files!.file.directory(), path)),
              })
            }}
          >
            <div class="relative min-h-0">
              <main
                data-slot="session-message-scroller"
                class={`${SESSION_MESSAGE_SCROLLER_CLASS} h-full`}
                ref={interaction.view.setScrollRef}
                onScroll={interaction.view.onScroll}
              >
                <div ref={interaction.view.setContentRef} class="grid min-h-full">
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
                      <DataProvider
                        data={sessionUiData()}
                        directory={state.session ? sessionDirectory(state.session) : ""}
                      >
                        <CompactMessageTimeline
                          document={timeline.document()}
                          actions={region.actions.timeline}
                          showReasoningSummaries={settings.general.showReasoningSummaries()}
                          onPointerGesture={interaction.view.markUserScroll}
                        />
                      </DataProvider>
                    </Show>
                  </Show>
                </div>
              </main>
              <Show when={interaction.scroll.jump}>
                <IconButton
                  icon={<Icon name="arrow-down-to-line" />}
                  size="large"
                  variant="neutral"
                  class="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 shadow-md"
                  aria-label={layout.language.t("session.messages.jumpToLatest")}
                  title={layout.language.t("session.messages.jumpToLatest")}
                  onClick={interaction.actions.resume}
                />
              </Show>
            </div>
          </SessionFileTabs>

          <Show when={state.error}>{(error) => <ErrorBanner error={error()} />}</Show>

          <ActiveSessionComposerRegion model={region.active} />
        </div>
      </div>
    </div>
  )
}

export default SessionPage
