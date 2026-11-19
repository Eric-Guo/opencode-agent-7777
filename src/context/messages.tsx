import type { Turn } from "@cybros/agent"
import { File } from "@opencode/session-ui/file"
import { Markdown } from "@opencode/session-ui/markdown"
import { Accordion } from "@opencode/ui/accordion"
import { Icon } from "@opencode/ui/icon"
import { checksum } from "@opencode/util/encode"
import { createMemo, For, Show, type JSX, type ParentProps } from "solid-js"
import type { ChatController } from "@/nexus/controller"
import { chatPath, DetailRead } from "@/nexus/detail-read"
import { useLanguage } from "@/runtime/i18n/language"

export function SessionContextMessages(props: { chat: ChatController }) {
  const language = useLanguage()
  const turns = () => props.chat.s.snapshot.turns
  const latestRequest = createMemo(() => {
    const reply = turns().findLast((turn) => turn.variant && !turn.kind && !turn.pruned && (turn.model || turn.run))
    if (reply?.variant) return { turn: reply.id, variant: reply.variant }
  })
  const noPrompt = () => <p class="py-2 text-text-weak">{language.t("context.noSystemPrompt")}</p>

  return (
    <section class="min-w-0 border-t border-border-weak-base pt-4" aria-label={language.t("context.inspect")}>
      <p class="mb-2 text-12-regular text-text-weak">{language.t("context.loadedHistory")}</p>
      <Accordion multiple>
        <ContextSection value="system" title={language.t("context.systemPrompt")}>
          <Show when={latestRequest()} fallback={noPrompt()}>
            {(query) => (
              <DetailRead<string | null> chat={props.chat} path={chatPath(props.chat, "system-prompt", query())}>
                {(prompt) => (
                  <Show when={prompt()} fallback={noPrompt()}>
                    {(text) => (
                      <div class="min-w-0 rounded-md border border-border-weak-base p-3">
                        <Markdown text={text()} />
                      </div>
                    )}
                  </Show>
                )}
              </DetailRead>
            )}
          </Show>
        </ContextSection>
        <ContextSection value="messages" title={language.t("context.rawMessages")}>
          <Show when={turns().length} fallback={<p class="py-2 text-text-weak">{language.t("context.noMessages")}</p>}>
            <Accordion multiple>
              <For each={turns()}>
                {(turn) => (
                  <ContextSection
                    value={turn.id}
                    title={
                      <span class="min-w-0 break-all font-mono text-12-regular">
                        {language.t("context.rawTurn", { position: turn.position })} • {turn.id}
                      </span>
                    }
                  >
                    <DetailRead<Turn> chat={props.chat} path={chatPath(props.chat, "raw-message", { turn: turn.id })}>
                      {(record) => <RawMessage record={record()} />}
                    </DetailRead>
                  </ContextSection>
                )}
              </For>
            </Accordion>
          </Show>
        </ContextSection>
      </Accordion>
    </section>
  )
}

function ContextSection(props: ParentProps<{ value: string; title: JSX.Element }>) {
  return (
    <Accordion.Item value={props.value}>
      <Accordion.Header>
        <Accordion.Trigger class="flex w-full items-center justify-between gap-2 py-2 text-left">
          {props.title}
          <Icon name="chevron-grabber-vertical" size="small" class="shrink-0 text-text-weak" />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content>{props.children}</Accordion.Content>
    </Accordion.Item>
  )
}

function RawMessage(props: { record: Turn }) {
  const file = createMemo(() => {
    const contents = JSON.stringify(props.record, null, 2)
    return { name: `turn-${props.record.public_id}.json`, contents, cacheKey: checksum(contents) }
  })
  return <File mode="text" file={file()} overflow="wrap" class="min-w-0 select-text" />
}
