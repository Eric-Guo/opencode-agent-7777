import "../src/index.css"
import { render } from "solid-js/web"
import { ThemeProvider } from "@opencode/ui/theme/context"
import { createStore } from "solid-js/store"
import { Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { QuestionPrompt } from "../src/session/requests/question-prompt"
import { PermissionPrompt } from "../src/session/requests/permission-prompt"
export const Question = {
  render: () => {
    const [state, setState] = createStore({ request: 1, responding: false, result: "", dismissed: 0 })

    return (
      <div class="max-w-[640px]">
        <label>
          <input
            type="checkbox"
            checked={state.responding}
            onChange={(e) => setState("responding", e.currentTarget.checked)}
          />
          Responding
        </label>
        <Button onClick={() => setState({ request: state.request + 1, result: "", responding: false })}>
          New request
        </Button>
        <Show when={state.request} keyed>
          {(_request) => (
            <QuestionPrompt
              questions={[
                {
                  key: "layout",
                  question: "Which layout?",
                  options: [
                    { value: "compact", label: "Compact", description: "Keep the timeline small" },
                    { value: "wide", label: "Wide" },
                  ],
                },
                {
                  key: "checks",
                  question: "Which checks?",
                  multiple: true,
                  options: [
                    { value: "tests", label: "Tests" },
                    { value: "types", label: "Types" },
                  ],
                },
                { key: "notes", question: "Any notes?", options: [] },
              ]}
              progress={(current, total) => `${current} of ${total} questions`}
              responding={state.responding}
              onReply={(answer) => setState("result", JSON.stringify(answer))}
              onReject={() => setState("dismissed", (count) => count + 1)}
            />
          )}
        </Show>
        <output aria-label="Answer">{state.result}</output>
        <output aria-label="Dismissed">{state.dismissed}</output>
      </div>
    )
  },
}

export const Permission = {
  render: () => {
    const [state, setState] = createStore({ responding: false, details: true, result: "" })

    return (
      <div class="max-w-[640px]">
        <label>
          <input
            type="checkbox"
            checked={state.responding}
            onChange={(e) => setState("responding", e.currentTarget.checked)}
          />
          Responding
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.details}
            onChange={(e) => setState("details", e.currentTarget.checked)}
          />
          Details
        </label>
        <PermissionPrompt
          title="Permission required"
          description={state.details ? "Allow this command to run?" : undefined}
          resources={state.details ? ["npm publish --tag canary", "packages/*"] : []}
          responding={state.responding}
          onDecide={(response) => setState("result", response)}
        />
        <output aria-label="Decision">{state.result}</output>
      </div>
    )
  },
}

const root = document.getElementById("oc-agent")

if (root) {
  render(
    () => (
      <ThemeProvider>
        {new URLSearchParams(location.search).get("prompt") === "permission" ? Permission.render() : Question.render()}
      </ThemeProvider>
    ),
    root,
  )
}
