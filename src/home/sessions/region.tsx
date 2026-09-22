import { Icon } from "@opencode/ui/icon"
import { Popover } from "@opencode/ui/popover"
import { createEffect, createMemo, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { state } from "@/runtime/server/session-store-compact"
import { createDirectorySdk } from "@/runtime/server/directory-client-compact"
import { sessionDirectory } from "@/session/directory"
import { createHomeSessionsController } from "./controller"
import { createHomeSessionIndex } from "./index"
import { createHomeSessionSearchController } from "./search"
import { openRecentSession } from "./switcher-compact"
import { HomeSessionsView } from "./view"

// The compact Home region is hosted in the session header instead of a route.
export function HomeSessionsRegion() {
  const language = useLanguage()
  const [local, setLocal] = createStore({ open: false })
  const source = createMemo(() => {
    const server = state.server
    const session = state.session
    if (!server || !session) return
    const directory = sessionDirectory(session)
    const client = createDirectorySdk(server, directory).client
    return { directory, sessionID: session.id, list: client.session.list, get: client.session.get }
  })
  const data = createHomeSessionIndex({ source })
  const sessions = createHomeSessionsController({
    data,
    switching: () => !!state.recentSessionSwitchingID,
    open: (session) => void openRecentSession(session),
  })
  const search = createHomeSessionSearchController(sessions)
  const setOpen = (open: boolean) => {
    search.query.reset()
    setLocal("open", open)
    if (open) void data.refresh()
    else data.clear()
  }
  createEffect(on(source, () => setOpen(false), { defer: true }))
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
        type: "button",
        "aria-label": language.t("session.recent"),
        title: language.t("session.recent"),
        disabled: !source(),
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
