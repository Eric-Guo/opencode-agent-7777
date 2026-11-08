import { render } from "solid-js/web"
import { AppBaseProviders } from "../src/app"
import { createPromptState } from "../src/composer/state"
import { ComposerEditor } from "../src/composer/editor/editor"
import { createComposerEditor } from "../src/composer/editor/interaction"

function ComposerFixture() {
  const draft = createPromptState()
  const controller = createComposerEditor({
    store: draft.store,
    commands: () => [],
    context: () => [],
    searchContextFiles: () => [],
    capabilities: { shell: false },
    view: { submit: { stopping: () => false, onSubmit() {}, onStop() {} } },
  })

  return (
    <main class="mx-auto flex max-w-[680px] flex-col gap-4 p-8">
      <ComposerEditor controller={controller} labels={{ prompt: "Message" }} />
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
      </div>
      <output aria-label="Draft text">{draft.current()}</output>
      <output aria-label="Attachments">{draft.attachments().length}</output>
    </main>
  )
}

render(
  () => (
    <AppBaseProviders locale="en">
      <ComposerFixture />
    </AppBaseProviders>
  ),
  document.getElementById("oc-agent")!,
)
