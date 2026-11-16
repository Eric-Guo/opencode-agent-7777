import { OpenCode } from "@opencode/client/promise"
import { onCleanup, onMount, Show, Suspense } from "solid-js"
import { render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { AppBaseProviders } from "../src/app"
import { createSessionDraft } from "../src/new-session/draft"
import { createComposerCatalog } from "../src/composer/catalog-compact"
import { commandSuggestions, contextSuggestions, fileSuggestions } from "../src/composer/suggestions/catalog-compact"
import { createBlobReference } from "../src/runtime/persistence/drafts"
import { createPromptState } from "../src/composer/state"
import { ComposerEditor } from "../src/composer/editor/editor"
import { createComposerEditor } from "../src/composer/editor/interaction"

function ComposerFixture() {
  const draft = createPromptState()
  const attachmentFixture = new URLSearchParams(location.search).has("attachments")
  const historyFixture = new URLSearchParams(location.search).has("history")
  const suggestions = new URLSearchParams(location.search).has("suggestions")
  const [state, setState] = createStore({
    commands: suggestions ? ["alpha", "beta", "gamma"].map((name) => ({ name })) : [],
    submissions: 0,
    stops: 0,
    error: "",
    identity: "first",
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
    identity: () => state.identity,
    scope: draft.scope,
    history: historyFixture
      ? {
          entries: (mode) =>
            (mode === "normal" ? ["newer", "older"] : ["shell entry"]).map((content) => ({
              prompt: [{ type: "text" as const, content, start: 0, end: content.length }],
            })),
          add() {},
        }
      : undefined,
    attachments: attachmentFixture
      ? {
          scope: draft.scope,
          directory: () => "",
          dropTarget: () => document.getElementById("oc-agent")!,
          isDialogActive: () => false,
          onError: (error) => setState("error", error instanceof Error ? error.message : String(error)),
          warn: () => setState("error", "Unsupported file"),
          duplicate: () => setState("error", "Duplicate file"),
          store: async (file, signal) => {
            // Hold preparation through a fixture request, including reads that ignore cancellation.
            const response = await fetch(`/component-tests/attachment?name=${encodeURIComponent(file.name)}`)
            if (!response.ok) throw new Error("Attachment read failed")
            return createBlobReference(file, signal)
          },
        }
      : undefined,
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
    capabilities: { shell: historyFixture },
    view: {
      submit: {
        stopping: () => attachmentFixture && !draft.dirty(),
        working: () => suggestions || attachmentFixture,
        queue: attachmentFixture ? { count: () => 1, delivery: () => "steer", alternate: () => "queue" } : undefined,
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
      <Show when={historyFixture}>
        <div class="flex flex-wrap gap-2" onMouseDown={(event) => event.preventDefault()}>
          <button onClick={() => draft.restore({ prompt: "replacement", attachments: [] })}>Replace draft</button>
          <button onClick={() => setState("identity", state.identity === "first" ? "second" : "first")}>
            Switch owner
          </button>
          <button onClick={() => draft.store[1]("mode", controller.mode() === "normal" ? "shell" : "normal")}>
            Change mode externally
          </button>
          <button
            onClick={() => {
              controller.restoreFocus(0)
              draft.reset()
              document.getElementById("fixture-focus-target")?.focus()
            }}
          >
            Schedule focus then reset
          </button>
        </div>
        <input id="fixture-focus-target" aria-label="Outside editor" />
        <output aria-label="History state">{controller.state.history.type}</output>
        <output aria-label="Composer mode">{controller.mode()}</output>
      </Show>
      <output aria-label="Draft text">{draft.current()}</output>
      <output aria-label="Attachments">{draft.attachments().length}</output>
      <Show when={suggestions || attachmentFixture}>
        <output aria-label="Submissions">{state.submissions}</output>
        <output aria-label="Stops">{state.stops}</output>
      </Show>
      <Show when={attachmentFixture}>
        <button onClick={() => controller.submit()}>Submit directly</button>
        <button onClick={() => controller.submit({ alternate: true })}>Submit alternate</button>
        <output aria-label="Attachment error">{state.error}</output>
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
