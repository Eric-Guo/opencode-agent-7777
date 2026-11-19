import { Icon } from "@opencode/ui/icon"
import { Popover } from "@opencode/ui/popover"
import { createEffect, createMemo, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { request, type createChatController } from "@/nexus/controller"
import type { RecentPage } from "@/nexus/chat"
import type { createSessionExporter } from "@/session/commands/export-session"
import type { createSessionActions } from "@/session/commands/session-actions"
import { SessionOptions } from "@/session/header/session-options"
import { createHomeSessionsController } from "./controller"
import { createHomeSessionIndex } from "./queries"
import { recentSessionTitle } from "./records"
import { createHomeSessionSearchController } from "./search"
import { HomeSessionsView } from "./view"

// The compact Home region is hosted in the session header instead of a route.
export function HomeSessionsRegion(props: {
  chat: ReturnType<typeof createChatController>
  exporter: ReturnType<typeof createSessionExporter>
  actions: ReturnType<typeof createSessionActions>
}) {
  let trigger!: HTMLButtonElement
  const language = useLanguage()
  const fallbackTitle = () => props.chat.s.connection?.agent ?? "OpenCode"
  const [local, setLocal] = createStore({ open: false, archived: false })
  const source = createMemo(() => {
    const connection = props.chat.s.connection
    if (!connection) return
    const filter = local.archived ? "archived=1" : ""
    return {
      sessionID: props.chat.s.id,
      list: (cursor?: string, signal?: AbortSignal) =>
        request<RecentPage>(
          "/chats?" + [filter, cursor && "after=" + encodeURIComponent(cursor)].filter(Boolean).join("&"),
          connection.scope,
          undefined,
          signal,
        ),
    }
  })
  const data = createHomeSessionIndex({ source })
  const sessions = createHomeSessionsController({
    data,
    switching: () => props.chat.s.sending,
    open: (session) => props.chat.select(session.id),
  })
  const search = createHomeSessionSearchController(sessions, () => setOpen(false))
  const setOpen = (open: boolean) => {
    search.query.reset()
    setLocal("open", open)
    if (open) void data.refresh()
    else data.clear()
  }
  createEffect(
    on(
      () => [props.chat.s.connection?.scope, props.chat.s.id],
      () => setOpen(false),
      { defer: true },
    ),
  )
  createEffect(
    on(
      () => local.archived,
      () => {
        if (local.open) void data.refresh(search.query.value())
      },
      { defer: true },
    ),
  )
  onCleanup(data.clear)

  return (
    <Popover
      open={local.open}
      onOpenChange={setOpen}
      placement="bottom-end"
      title={language.t("session.recent")}
      class="w-[320px] !max-w-[calc(100vw-28px)] [&_[data-slot=popover-body]]:!p-2"
      triggerAs="button"
      triggerProps={{
        ref: (element) => (trigger = element),
        type: "button",
        "aria-label": language.t("session.recent"),
        title: language.t("session.recent"),
        disabled: !source() || props.chat.s.sending,
        class:
          "inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 text-xs font-[650] text-v2-text-text-muted hover:border-v2-border-border-strong hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:opacity-55 data-[expanded]:border-v2-border-border-strong data-[expanded]:bg-v2-overlay-simple-overlay-hover [&_[data-component=icon]]:h-3.5 [&_[data-component=icon]]:w-3.5",
      }}
      trigger={<Icon name="bullet-list" />}
    >
      <Show when={local.open}>
        <div class="chat-row px-2 pb-2" role="group" aria-label={language.t("chat.archivedView")}>
          <button
            type="button"
            class="chat-tab"
            aria-pressed={!local.archived}
            onClick={() => setLocal("archived", false)}
          >
            {language.t("chat.active")}
          </button>
          <button
            type="button"
            class="chat-tab"
            aria-pressed={local.archived}
            onClick={() => setLocal("archived", true)}
          >
            {language.t("chat.archived")}
          </button>
        </div>
        <HomeSessionsView
          sessions={sessions}
          search={search}
          fallbackTitle={fallbackTitle()}
          row={(session, option) => {
            const scope = props.chat.s.connection?.scope
            if (!scope) return option
            return (
              <SessionOptions
                target={{ id: session.id, scope }}
                title={recentSessionTitle(session, fallbackTitle())}
                archived={local.archived}
                loadDetail
                busy={props.chat.s.sending}
                exporter={props.exporter}
                actions={props.actions}
                onSelect={() => {
                  setOpen(false)
                  trigger.focus({ preventScroll: true })
                }}
              >
                {option}
              </SessionOptions>
            )
          }}
        />
      </Show>
    </Popover>
  )
}
