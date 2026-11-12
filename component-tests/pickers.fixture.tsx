import { OpenCode, type SessionInfo } from "@opencode/client/promise"
import { onCleanup, onMount, type ComponentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { AppBaseProviders } from "../src/app"
import { createSessionDraft } from "../src/new-session/draft"
import { createHomeSessionIndex } from "../src/home/sessions/queries"
import { createHomeSessionsController } from "../src/home/sessions/controller"
import { createHomeSessionSearchController } from "../src/home/sessions/search"
import { HomeSessionsView } from "../src/home/sessions/view"
import { ModelSelectorPopoverView } from "../src/providers/models/select-dialog"

function RecentSessions() {
  const [state, setState] = createStore({ opened: "", closed: 0, query: "", switching: false, removed: "" })
  const records: SessionInfo[] = Array.from({ length: 13 }, (_, index) => ({
    id: `session-${index + 1}`,
    title: `Session ${index + 1}`,
    projectID: "project",
    location: { directory: "/repo" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 100 - index },
  }))
  const source = {
    directory: "/repo",
    sessionID: "current",
    get: async () => records[0],
    list: async (input: { cursor?: string; search?: string; limit?: number }) => {
      setState("query", input.search ?? "")
      const matches = records.filter((item) => item.id !== state.removed && item.title?.includes(input.search ?? ""))
      const start = Number(input.cursor ?? 0)
      const end = start + (input.limit ?? 12)
      return { data: matches.slice(start, end), cursor: { next: end < matches.length ? String(end) : undefined } }
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
      <output aria-label="Server query">{state.query}</output>
    </section>
  )
}

type ModelItem = ReturnType<ComponentProps<typeof ModelSelectorPopoverView>["all"]>[number]

function Models() {
  const params = new URLSearchParams(location.search)
  const [state, setState] = createStore({ selected: "openai:beta", managed: 0, closed: 0, removed: "" })
  let editor!: HTMLInputElement
  const model = (id: string, name: string, providerID: string): ModelItem => ({
    id,
    modelID: id,
    name,
    modelName: name,
    providerID,
    providerName: providerID === "console-openai" ? "Workspace / OpenAI" : "OpenAI",
    provider: { id: providerID, name: providerID === "console-openai" ? "Workspace / OpenAI" : "OpenAI", models: {} },
    api: { id },
    status: "active",
    limit: { context: 1000, output: 100 },
    cost: { input: 1, output: 1, cache: { read: 0, write: 0 } },
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    latest: false,
  })
  const catalog = [
    model("alpha", "Alpha", "console-openai"),
    model("beta", "Beta", "openai"),
    model("zulu", "Zulu", "openai"),
    ...(params.has("overflow")
      ? Array.from({ length: 20 }, (_, index) =>
          model(`extra-${index}`, `Extra ${String(index).padStart(2, "0")}`, "openai"),
        )
      : []),
  ]
  const all = () => catalog.filter((item) => item.id !== state.removed)
  const manage = params.get("manage") !== "false"
  const source = params.has("plan")
    ? createSessionDraft(OpenCode.make({ baseUrl: location.origin + "/component-tests" }), "/fixture")
    : undefined
  onCleanup(() => source?.dispose())

  // Simulate a catalog update while the menu owns focus, without reaching into production state.
  onMount(() => {
    const update = (event: KeyboardEvent) => {
      if (event.key === "F4") setState("removed", "beta")
    }
    document.addEventListener("keydown", update)
    onCleanup(() => document.removeEventListener("keydown", update))
  })

  return (
    <section aria-label="Model picker fixture" class="p-2 pt-80">
      <input ref={editor} aria-label="Draft" value="Keep this draft" />
      <ModelSelectorPopoverView
        all={all}
        visible={() => true}
        current={catalog.find((item) => `${item.providerID}:${item.id}` === state.selected)}
        integrationSource={source}
        trigger={(props) => <button {...props}>Models</button>}
        select={(item) => {
          setState("selected", `${item.provider.id}:${item.id}`)
          editor.focus()
        }}
        onManage={manage ? () => setState("managed", (value) => value + 1) : undefined}
        onClose={() => {
          setState("closed", (value) => value + 1)
          editor.focus()
        }}
      />
      <output aria-label="Selected model">{state.selected}</output>
      <output aria-label="Managed">{state.managed}</output>
      <output aria-label="Model closes">{state.closed}</output>
    </section>
  )
}

render(
  () => (
    <AppBaseProviders locale="en">
      {new URLSearchParams(location.search).get("picker") === "models" ? <Models /> : <RecentSessions />}
    </AppBaseProviders>
  ),
  document.getElementById("oc-agent")!,
)
