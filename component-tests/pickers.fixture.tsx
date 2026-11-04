import type { RecentChat as SessionInfo } from "../src/nexus/chat"
import { onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { AppBaseProviders } from "../src/app"
import { createHomeSessionIndex } from "../src/home/sessions/index"
import { createHomeSessionsController } from "../src/home/sessions/controller"
import { createHomeSessionSearchController } from "../src/home/sessions/search"
import { HomeSessionsView } from "../src/home/sessions/view"

function RecentSessions() {
  const [state, setState] = createStore({ opened: "", closed: 0, query: "", switching: false, removed: "" })
  const records: SessionInfo[] = Array.from({ length: 13 }, (_, index) => ({
    id: `session-${index + 1}`,
    title: `Session ${index + 1}`,
    time: { created: 1, updated: 100 - index },
  }))
  const source = {
    sessionID: "current",
    list: async (cursor?: string) => {
      const matches = records.filter((row) => row.id !== state.removed)
      const start = Number(cursor ?? 0)
      return { items: matches.slice(start, start + 12), next: start + 12 < matches.length ? String(start + 12) : null }
    },
  }
  const data = createHomeSessionIndex({ source: () => source })
  const sessions = createHomeSessionsController({
    data,
    switching: () => state.switching,
    open: (item) => setState("opened", item.id),
  })
  const close = () => setState("closed", (value) => value + 1)
  const search = createHomeSessionSearchController(sessions, close)
  onMount(() => void data.refresh())
  onCleanup(data.clear)

  return (
    <section aria-label="Recent sessions fixture" class="w-[320px] p-2">
      <label>
        <input
          type="checkbox"
          checked={state.switching}
          onChange={(e) => setState("switching", e.currentTarget.checked)}
        />
        Switching session
      </label>
      <button
        onClick={() => {
          setState("removed", search.result.activeItem()?.id ?? "")
          void data.refresh(search.query.value())
        }}
      >
        Remove highlighted session
      </button>
      <button
        onClick={() => {
          search.query.reset()
          void data.refresh()
        }}
      >
        Reopen sessions
      </button>
      <HomeSessionsView sessions={sessions} search={search} fallbackTitle="Agent" />
      <output aria-label="Opened session">{state.opened}</output>
      <output aria-label="Session closes">{state.closed}</output>
      <output aria-label="Server query">{search.query.value()}</output>
    </section>
  )
}

render(
  () => (
    <AppBaseProviders>
      <RecentSessions />
    </AppBaseProviders>
  ),
  document.getElementById("oc-agent")!,
)
