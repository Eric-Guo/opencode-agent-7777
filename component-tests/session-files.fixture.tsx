import { onMount } from "solid-js"
import { render } from "solid-js/web"
import { AppBaseProviders } from "../src/app"
import { createClientForServer } from "../src/runtime/server/client-compact"
import { setSessionDraft, setState, state } from "../src/runtime/server/session-store-compact"
import { createSessionFiles, SessionFileTabs, SessionSidePanel } from "../src/session/files/session-side-panel"

function Fixture() {
  const files = createSessionFiles()
  const newDraft = () => {
    const server = { url: location.origin, localAgent: "plm-meeting", welcomeText: "", suggestedQuestions: [] }
    setState("server", server)
    setSessionDraft(createClientForServer({ server }), "/workspace/agent-plm-meeting")
  }
  onMount(newDraft)

  return (
    <>
      <button onClick={newDraft}>New draft</button>
      <output aria-label="Session ID">{state.session?.id ?? "No session"}</output>
      <div class="session-workspace" style={{ height: "600px" }}>
        <SessionSidePanel model={files} />
        <div class="session-conversation">
          <SessionFileTabs model={files} onAdd={() => {}} disabled={false}>
            Draft conversation
          </SessionFileTabs>
        </div>
      </div>
    </>
  )
}

render(
  () => (
    <AppBaseProviders locale="en">
      <Fixture />
    </AppBaseProviders>
  ),
  document.getElementById("oc-agent")!,
)
