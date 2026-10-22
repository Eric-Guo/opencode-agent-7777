import { createMemo, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import type { SessionDocument } from "@opencode/session-ui/document"
import { CurrentSessionProviders, STORY_MODEL, STORY_TIME } from "@opencode/session-ui/storybook"
import { Button } from "@opencode/ui/button"
import { AppBaseProviders } from "../src/app"
import { CompactMessageTimeline } from "../src/session/timeline/message-timeline-compact"
import { fence, graphSource, lineSource, pieSource, zoomSource } from "./echarts-data"
import layoutExamples from "./echarts-layout-examples.json"

const scenario = new URLSearchParams(location.search).get("scenario")
const examples: Record<string, string> = {
  mixed: [
    fence(lineSource, "json"),
    fence(pieSource),
    fence('{"hello":"world"}', "json"),
    fence("graph LR\nA[Input] --> B[Output]", "mermaid"),
  ].join("\n\n"),
  streaming: "```echarts\n{",
  plain: fence('{"hello":"world"}', "json"),
  invalid: fence("{invalid}"),
  renderError: fence('{"series":[{"type":"line","data":[1,2]}]}'),
  reset: [fence(zoomSource), fence(graphSource)].join("\n\n"),
  layout: layoutExamples.map((option) => fence(JSON.stringify(option))).join("\n\n"),
}

function Fixture() {
  const [state, setState] = createStore({
    text: examples[scenario ?? ""] ?? fence(lineSource, "json"),
    completed: scenario !== "streaming",
    mounted: true,
    narrow: false,
    hidden: scenario === "hidden",
    session: 1,
  })
  const document = createMemo(
    (): SessionDocument => ({
      sessionID: `ses_chart_${state.session}`,
      status: { type: state.completed ? "idle" : "busy" },
      diffs: [],
      messages: [
        {
          id: `msg_user_${state.session}`,
          type: "user",
          text: fence(pieSource),
          time: { created: STORY_TIME },
          metadata: { agent: "build", model: STORY_MODEL },
        },
        {
          id: `msg_assistant_${state.session}`,
          type: "assistant",
          agent: "build",
          model: STORY_MODEL,
          time: { created: STORY_TIME + 100, completed: state.completed ? STORY_TIME + 1000 : undefined },
          content: [{ type: "text", text: state.text }],
        },
      ],
    }),
  )

  return (
    <AppBaseProviders locale="en">
      <section style={{ height: "100vh", overflow: "auto", padding: "16px" }}>
        <nav
          style={{
            display: "flex",
            gap: "8px",
            "flex-wrap": "wrap",
            position: "sticky",
            top: "0",
            "z-index": 10,
            background: "var(--v2-background-bg-base)",
          }}
        >
          <Button onClick={() => setState("text", `\`\`\`echarts\n${lineSource}`)}>Finish JSON</Button>
          <Button onClick={() => setState("text", fence(lineSource))}>Close fence</Button>
          <Button onClick={() => setState("completed", true)}>Complete message</Button>
          <Button onClick={() => setState({ text: fence(pieSource), completed: true })}>Replace chart</Button>
          <Button onClick={() => setState("session", (value) => value + 1)}>Switch session</Button>
          <Button onClick={() => setState("mounted", !state.mounted)}>Toggle timeline</Button>
          <Button onClick={() => setState("narrow", !state.narrow)}>Toggle width</Button>
          <Button onClick={() => setState("hidden", !state.hidden)}>Toggle visibility</Button>
        </nav>
        <div style={{ width: state.narrow ? "360px" : "100%", display: state.hidden ? "none" : "block" }}>
          <Show when={state.mounted}>
            <CurrentSessionProviders document={document()}>
              <CompactMessageTimeline document={document()} showReasoningSummaries={false} />
            </CurrentSessionProviders>
          </Show>
        </div>
      </section>
    </AppBaseProviders>
  )
}

render(() => <Fixture />, document.getElementById("oc-agent")!)
