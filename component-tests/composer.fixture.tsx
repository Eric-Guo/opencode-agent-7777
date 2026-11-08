import { OpenCode } from "@opencode/client/promise"
import { onCleanup, onMount, Show, Suspense } from "solid-js"
import { render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { AppBaseProviders } from "../src/app"
import { createSessionDraft } from "../src/new-session/draft"
import { createComposerCatalog } from "../src/composer/catalog-compact"
import { commandSuggestions, contextSuggestions, fileSuggestions } from "../src/composer/suggestions/catalog-compact"
import { createPromptState } from "../src/composer/state"
import { ComposerEditor } from "../src/composer/editor/editor"
import { createComposerEditor } from "../src/composer/editor/interaction"

function ComposerFixture() {
  const draft = createPromptState()
  const suggestions = new URLSearchParams(location.search).has("suggestions")
  const [state, setState] = createStore({
    commands: suggestions ? ["alpha", "beta", "gamma"].map((name) => ({ name })) : [],
    submissions: 0,
    stops: 0,
  })
  const source = new URLSearchParams(location.search).has("catalog")
    ? createSessionDraft(OpenCode.make({ baseUrl: location.origin + "/component-tests" }), "/fixture")
    : undefined
  const catalog = source ? createComposerCatalog() : undefined
  const load = () => source && catalog?.load(source.data, source.directory)
  onMount(() => void load())
  onCleanup(() => source?.dispose())
  const controller = createComposerEditor({
    store: draft.store,
    commands: () => commandSuggestions(catalog?.state.commands ?? state.commands, []),
    context: () =>
      contextSuggestions(
        catalog?.state.skills ?? state.commands.map(({ name }) => ({ id: name, name, path: `/skills/${name}` })),
        catalog?.state.agents ?? [],
      ),
    searchContextFiles: async (query) => {
      if (!suggestions) return []
      const paths: string[] = await fetch(`/component-tests/files?query=${encodeURIComponent(query)}`).then(
        (response) => response.json(),
      )
      return fileSuggestions(paths, "/fixture")
    },
    capabilities: { shell: false },
    view: {
      submit: {
        stopping: () => false,
        working: () => suggestions,
        onSubmit: () => setState("submissions", (count) => count + 1),
        onStop: () => setState("stops", (count) => count + 1),
      },
    },
  })

  return (
    <main class="mx-auto flex max-w-[680px] flex-col gap-4 p-8" style={{ "padding-top": "192px" }}>
      <ComposerEditor controller={controller} labels={{ prompt: "Message", commands: "Commands" }} />
      <div class="flex gap-4" onMouseDown={(event) => event.preventDefault()}>
        <button
          onClick={() =>
            draft.addAttachment({
              id: "notes",
              filename: "notes.txt",
              mime: "text/plain",
              url: "data:text/plain;base64,bm90ZXM=",
            })
          }
        >
          Add example attachment
        </button>
        <button onClick={() => draft.store[1]("prompt", 0, "content", "External update")}>Update text in place</button>
        <button onClick={draft.reset}>Clear draft</button>
        <Show when={suggestions}>
          <button onClick={controller.openCommands}>Open commands</button>
          <button onClick={() => setState("commands", (items) => items.map((item) => ({ ...item })))}>
            Refresh commands
          </button>
          <button onClick={() => setState("commands", (items) => items.filter((item) => item.name !== "beta"))}>
            Remove beta
          </button>
        </Show>
      </div>
      <output aria-label="Draft text">{draft.current()}</output>
      <output aria-label="Attachments">{draft.attachments().length}</output>
      <Show when={suggestions}>
        <output aria-label="Submissions">{state.submissions}</output>
        <output aria-label="Stops">{state.stops}</output>
      </Show>
      <Show when={catalog}>
        {(catalog) => (
          <>
            <output aria-label="Command status">{catalog().state.commandStatus}</output>
            <output aria-label="Skill status">{catalog().state.skillStatus}</output>
            <button onClick={() => void load()}>Reload catalogs</button>
          </>
        )}
      </Show>
    </main>
  )
}

render(
  () => (
    <AppBaseProviders locale="en">
      <Suspense fallback={<p>Loading composer fixture</p>}>
        <ComposerFixture />
      </Suspense>
    </AppBaseProviders>
  ),
  document.getElementById("oc-agent")!,
)
