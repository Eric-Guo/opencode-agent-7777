import { createEffect, createMemo, onCleanup, onMount, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { SessionHeader } from "./header/session-header"
import { ScrollView } from "@opencode/ui/scroll-view"
import { ComposerEditor } from "@/composer/editor/editor"
import { createComposerEditor } from "@/composer/editor/interaction"
import { promptText, replacePromptText } from "@/composer/prompt-parts"
import type { ComposerPersistedState } from "@/composer/types"
import { SET_DOCUMENT_TITLE } from "@/constants/session"
import { createChatController } from "@/nexus/controller"
import { timeline } from "@/nexus/timeline"
import { DecisionDock } from "@/nexus/decision"
import { useLanguage } from "@/runtime/i18n/language"
import { ErrorBanner } from "@/shell/errors/banner-compact"
import { SessionUIProvider } from "@/shell/routes/session-ui-provider"
import { AgentWelcome } from "./agent-welcome-compact"
import "@/nexus/chat.css"
import { ChatTranscript } from "@/nexus/transcript"
import { SendControls } from "@/nexus/send-controls"
import { useSettings } from "@/settings/model"
import { createSessionTimelineInteraction } from "./timeline/interaction"

export default function SessionPage() {
  const chat = createChatController()
  const settings = useSettings()
  const s = chat.s
  const language = useLanguage()
  const doc = createMemo(() => timeline(s.id, s.snapshot, s.live, s.connection))
  const interaction = createSessionTimelineInteraction({ identity: () => s.id, items: () => doc().messages })
  const draft = createStore<ComposerPersistedState>({ prompt: [], context: { items: [] } })
  const agent = () => s.connection?.agent || "rho"
  const editor = createComposerEditor({
    store: draft,
    identity: () => s.id,
    commands: () => [],
    context: () => [],
    searchContextFiles: () => [],
    capabilities: { commands: false, shell: false, context: false },
    onChange: () => chat.edit(promptText(draft[0].prompt)),
    view: {
      placeholder: () => language.t("prompt.message.aria"),
      submit: {
        enabled: () => chat.writable() && !s.sending,
        stopping: () => s.snapshot.busy && !s.sending && (!s.draft.trim() || !chat.writable()),
        onSubmit: (options) => void chat.send(options?.alternate, settings.general.followUpBehavior()),
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
  onMount(() => {
    void chat.connect()
  })
  onCleanup(chat.close)
  const problem = () => s.error || s.streamError || s.snapshot.problem
  const decisionID = () => {
    const d = s.snapshot.decisions[0]
    return d ? d.run + "/" + d.key : undefined
  }
  return (
    <div class="relative isolate grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] bg-v2-background-bg-deep text-v2-text-text-base">
      <SessionHeader chat={chat} dialogCount={doc().messages.filter((message) => message.type === "user").length} />
      <main class="relative min-h-0">
        <ScrollView
          data-slot="session-message-scroller"
          class="h-full [&>.scroll-view__viewport]:px-6 [&>.scroll-view__viewport]:py-5"
          viewportRef={interaction.view.setScrollRef}
          onScroll={interaction.view.onScroll}
          onKeyDown={interaction.view.onKeyDown}
        >
          <div ref={interaction.view.setContentRef} class="grid min-h-full">
            <Show
              when={doc().messages.length}
              fallback={
                <div class="grid place-items-center">
                  <AgentWelcome agent={agent()} onPrompt={chat.edit} />
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
          <Button class="absolute bottom-2 left-1/2" onClick={interaction.actions.resume}>
            <Icon name="arrow-down-to-line" />
          </Button>
        </Show>
      </main>
      <div>
        <Show when={problem()}>
          {(message) => (
            <>
              <ErrorBanner error={message()} />
              <Button disabled={s.sending || s.connecting} onClick={() => void chat.connect()}>
                {language.t("nexus.reconnect")}
              </Button>
            </>
          )}
        </Show>
      </div>
      <div class="mx-auto w-full max-w-[1120px] px-6 pb-5">
        <Show when={s.snapshot.detail?.owned || s.snapshot.detail?.archived}>
          <p class="chat-hint">{language.t(s.snapshot.detail?.archived ? "chat.archivedHint" : "chat.channel")}</p>
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
          disabled={!chat.writable() || s.sending}
          readOnly={!chat.writable() || s.sending}
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
    </div>
  )
}
