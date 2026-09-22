import { Icon } from "@opencode/ui/icon"
import { Popover } from "@opencode/ui/popover"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { state } from "@/runtime/server/session-store-compact"
import { createHomeSessionsController } from "./controller"
import { createHomeSessionSearchController } from "./search"
import { openRecentSession } from "./switcher-compact"
import { HomeSessionsView } from "./view"

// The compact Home region is hosted in the session header instead of a route.
export function HomeSessionsRegion() {
  const language = useLanguage()
  const [local, setLocal] = createStore({ open: false })
  const sessions = createHomeSessionsController({
    sessions: () => state.recentSessions,
    loading: () => state.recentSessionsLoading,
    switching: () => !!state.recentSessionSwitchingID,
    open: (session) => void openRecentSession(session),
  })
  const search = createHomeSessionSearchController(sessions)
  const setOpen = (open: boolean) => {
    search.query.reset()
    setLocal("open", open)
  }

  return (
    <Popover
      open={local.open}
      onOpenChange={setOpen}
      placement="bottom-end"
      title={language.t("session.recent")}
      class="w-[320px] !max-w-[calc(100vw-28px)] [&_[data-slot=popover-body]]:!p-2"
      triggerAs="button"
      triggerProps={{
        type: "button",
        "aria-label": language.t("session.recent"),
        title: language.t("session.recent"),
        disabled: sessions.data.loading() && sessions.data.list().length === 0,
        class:
          "inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 text-xs font-[650] text-v2-text-text-muted hover:border-v2-border-border-strong hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:opacity-55 data-[expanded]:border-v2-border-border-strong data-[expanded]:bg-v2-overlay-simple-overlay-hover [&_[data-component=icon]]:h-3.5 [&_[data-component=icon]]:w-3.5",
      }}
      trigger={<Icon name="bullet-list" />}
    >
      <Show when={local.open}>
        <HomeSessionsView sessions={sessions} search={search} onClose={() => setOpen(false)} />
      </Show>
    </Popover>
  )
}
