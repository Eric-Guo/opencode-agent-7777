import { createEffect, createMemo, onCleanup, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { showToast } from "@opencode/ui/toast"
import { SessionHeader } from "./header/session-header"
import { ScrollView } from "@opencode/ui/scroll-view"
import { ComposerEditor } from "@/composer/editor/editor"
import { createComposerEditor } from "@/composer/editor/interaction"
import { promptText, replacePromptText } from "@/composer/prompt-parts"
import type { ComposerPersistedState } from "@/composer/types"
import { HISTORY_DIALOG_LIMIT, SET_DOCUMENT_TITLE } from "@/constants/session"
import { Management } from "@/management/shell"
import { createChatController } from "@/nexus/controller"
import { createNavigation } from "@/nexus/navigation"
import { timeline } from "@/nexus/timeline"
import { DecisionDock } from "@/nexus/decision"
import { useLanguage } from "@/runtime/i18n/language"
import { isElectronUserAgent } from "@/runtime/platform/platform-bridge"
import { ErrorBanner } from "@/shell/errors/banner-compact"
import { SessionUIProvider } from "@/shell/routes/session-ui-provider"
import { AgentWelcome } from "./agent-welcome-compact"
import "@/nexus/chat.css"
import { ChatTranscript } from "@/nexus/transcript"
import { SendControls } from "@/nexus/send-controls"
import { useSettings } from "@/settings/model"
import { createSessionTimelineInteraction } from "./timeline/interaction"
import { createSessionExporter } from "./commands/export-session"
import { useMessagePicker } from "./commands/message-picker"
import { BrowserPane, createSessionBrowser } from "./browser/pane"

export default function SessionPage() {
  const chat = createChatController()
  const navigation = createNavigation(chat)
  const browser = createSessionBrowser()
  const settings = useSettings()
  const s = chat.s
  const language = useLanguage()
  const doc = createMemo(() => timeline(s.id, s.snapshot, s.live, s.connection))
  const interaction = createSessionTimelineInteraction({ identity: () => s.id })
  const draft = createStore<ComposerPersistedState>({ prompt: [], context: { items: [] } })
  const agent = () => s.connection?.agent || "OpenCode"
  const exportOwner = createMemo(() => {
    const scope = s.connection?.scope
    if (scope && !navigation.page()) return { id: s.id, scope }
  })
  const exporter = createSessionExporter(exportOwner, () => s.hydrated && !s.accessDenied)
  const visiblePrompts = createMemo(() => doc().messages.filter((message) => message.type === "user"))
  const jumpPrompts = createMemo(() => {
    const delivered = new Set(s.snapshot.turns.filter((turn) => !turn.kind).map((turn) => turn.id + "-prompt"))
    return visiblePrompts()
      .slice(-HISTORY_DIALOG_LIMIT)
      .filter((message) => delivered.has(message.id))
  })
  const jumpOwner = () => (s.hydrated && !s.accessDenied ? exportOwner() : undefined)
  const openJump = useMessagePicker(jumpOwner, jumpPrompts, interaction.actions.jumpToMessage)
  const runExport = () => {
    if (!s.id) {
      showToast({ title: language.t("toast.session.export.noSession") })
      return
    }
    void exporter.run()
  }
  const editor = createComposerEditor({
    store: draft,
    identity: () => s.id,
    commands: () => [
      {
        id: "session.export",
        kind: "command",
        trigger: "export",
        label: "/export",
        title: language.t("command.session.export"),
        description: language.t("command.session.export.description"),
      },
    ],
    context: () => [],
    searchContextFiles: () => [],
    capabilities: { shell: false, context: false },
    onChange: () => chat.edit(promptText(draft[0].prompt)),
    onSuggestionSelect: (item) => (item.id === "session.export" ? runExport : undefined),
    view: {
      placeholder: () => language.t("prompt.message.aria"),
      submit: {
        sendUnmatchedSlash: true,
        enabled: () => chat.writable() && !s.sending,
        stopping: () => chat.stoppable() && s.snapshot.busy && !s.sending && (!s.draft.trim() || !chat.writable()),
        onSubmit: (options) => {
          const text = s.draft.trim()
          if (!/^\/export(?=\s|$)/.test(text))
            return void chat.send(options?.alternate, settings.general.followUpBehavior())
          if (text !== "/export") {
            showToast({ title: language.t("prompt.command.noArguments", { command: "/export" }) })
            return
          }
          chat.edit("")
          runExport()
        },
        onStop: () => void chat.stop(),
      },
    },
  })
  createEffect(
    on(
      () => s.draft,
      (text) => {
        if (promptText(draft[0].prompt) !== text) draft[1]({ prompt: replacePromptText([], text), cursor: text.length })
      },
    ),
  )
  createEffect(() => {
    if (SET_DOCUMENT_TITLE) document.title = agent()
  })
  onCleanup(chat.close)
  const problem = () => s.error || s.streamError || s.snapshot.problem
  const reconnect = async () => {
    if (s.sending || s.connecting) return
    await navigation.reconnect()
    showToast(
      s.connection
        ? { variant: "success", title: language.t("nexus.reconnected") }
        : { variant: "error", title: language.t("nexus.connectionFailed"), description: s.error },
    )
  }
  const decisionID = () => {
    const d = s.snapshot.decisions[0]
    return d ? d.run + "/" + d.key : undefined
  }
  const transcript = (
    <div class="relative isolate grid h-full min-w-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] bg-v2-background-bg-deep">
      <Management chat={chat} navigation={navigation}>
        <SessionHeader
          chat={chat}
          exporter={exporter}
          dialogCount={visiblePrompts().length}
          onJumpToMessage={jumpOwner() && jumpPrompts().length ? openJump : undefined}
          windowDrag={isElectronUserAgent(navigator.userAgent) && !navigation.page()}
          browser={browser.api ? { open: browser.open(), toggle: browser.toggle } : undefined}
        />
        <main
          class="relative min-h-0"
          on:pointerdown={{ capture: true, handleEvent: interaction.view.markInput }}
          on:keydown={{ capture: true, handleEvent: interaction.view.markInput }}
          on:click={{ capture: true, handleEvent: interaction.view.markInput }}
          on:wheel={{ passive: true, handleEvent: interaction.view.markInput }}
          on:focusin={interaction.view.markInput}
        >
          <ScrollView
            data-slot="session-message-scroller"
            class="h-full"
            viewportRef={interaction.view.setScrollRef}
            onScroll={interaction.view.onScroll}
            onKeyDown={interaction.view.onKeyDown}
          >
            <div ref={interaction.view.setContentRef} class="grid min-h-full">
              <Show when={s.id && s.snapshot.turns.length && s.hasOlder}>
                <Button
                  class="justify-self-center"
                  disabled={s.loadingHistory}
                  onClick={() => void chat.earlier(interaction.view.preserveReadingPosition)}
                >
                  Load earlier messages
                </Button>
              </Show>
              <Show
                when={doc().messages.length}
                fallback={
                  <div class="grid place-items-center">
                    <AgentWelcome agent={agent()} disabled={!chat.writable()} onPrompt={chat.edit} />
                  </div>
                }
              >
                <SessionUIProvider
                  directory=""
                  data={{ session: [], session_status: { [s.id]: doc().status }, session_diff: {} }}
                >
                  <ChatTranscript chat={chat} document={doc()} onPointerGesture={interaction.view.markUserScroll} />
                </SessionUIProvider>
              </Show>
            </div>
          </ScrollView>
          <Show when={interaction.scroll.jump}>
            <Button
              class="absolute bottom-2 left-1/2"
              aria-label={language.t("session.messages.jumpToLatest")}
              onClick={interaction.actions.resume}
            >
              <Icon name="arrow-down-to-line" />
            </Button>
          </Show>
        </main>
        <div>
          <Show when={problem()}>{(message) => <ErrorBanner error={message()} />}</Show>
          <Show when={problem() || s.connecting}>
            <div class="mx-[22px] mb-3">
              <Button disabled={s.sending || s.connecting} aria-busy={s.connecting} onClick={() => void reconnect()}>
                <Show when={s.connecting}>
                  <Loader />
                </Show>
                {language.t(s.connecting ? "nexus.connecting" : "nexus.reconnect")}
              </Button>
            </div>
          </Show>
        </div>
        <div class="mx-auto w-full max-w-[1120px] px-6 pb-5">
          <Show when={s.snapshot.detail?.owned || s.snapshot.detail?.archived}>
            <p class="chat-hint">{language.t(s.snapshot.detail?.archived ? "chat.archivedHint" : "chat.channel")}</p>
          </Show>
          <Show when={s.snapshot.detail?.writable === false}>
            <p class="chat-hint">{language.t("chat.readOnly")}</p>
          </Show>
          <Show when={s.prepared && !s.sending && chat.writable()}>
            <p class="chat-hint">{language.t("chat.prepared")}</p>
          </Show>
          <Show when={s.snapshot.decisions.length > 1}>
            <small>{language.t("chat.position", { current: 1, total: s.snapshot.decisions.length })}</small>
          </Show>
          <Show when={decisionID()} keyed>
            {(_id) => {
              const { run, key } = s.snapshot.decisions[0]
              return (
                <DecisionDock
                  decision={s.snapshot.decisions[0]}
                  sending={s.sending || !chat.writable()}
                  reply={(response) => void chat.decide(run, key, response)}
                />
              )
            }}
          </Show>
          <ComposerEditor
            controller={editor}
            disabled={
              (!chat.writable() && !(s.submitting && !s.hydrated && !s.accessDenied)) || (s.sending && !s.submitting)
            }
            addMenuVisible={false}
            modelControlsVisible={false}
            agentControl={<SendControls chat={chat} />}
            labels={{
              prompt: language.t("prompt.message.aria"),
              send: language.t(
                s.snapshot.detail?.active
                  ? settings.general.followUpBehavior() === "queue"
                    ? "chat.queue"
                    : "chat.steer"
                  : "prompt.send",
              ),
              stop: language.t("prompt.stop"),
            }}
          />
        </div>
      </Management>
    </div>
  )
  return (
    <div class="relative flex h-full min-w-0 text-v2-text-text-base">
      {transcript}
      <Show when={browser.open() && !navigation.page() && browser.api}>
        {(api) => (
          <BrowserPane
            api={api()}
            state={browser.state()}
            width={browser.width()}
            resize={browser.resize}
            close={browser.toggle}
          />
        )}
      </Show>
    </div>
  )
}
