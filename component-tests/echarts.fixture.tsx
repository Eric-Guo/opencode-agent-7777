import { createMemo, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import type { SessionDocument } from "@opencode/session-ui/document"
import { CurrentSessionProviders, STORY_MODEL, STORY_TIME } from "@opencode/session-ui/storybook"
import { Button } from "@opencode/ui/button"
import { AppBaseProviders } from "../src/app"
import { CompactMessageTimeline } from "../src/session/timeline/message-timeline-compact"
import { SessionUIProvider } from "../src/shell/routes/session-ui-provider"
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
  const [report, setReport] = createStore({ type: "text" as const, text: "来源（" })
  const followUp: SessionDocument["messages"] =
    scenario === "streamed-link"
      ? [
          { id: "msg_follow_up", type: "user", text: "Show the report link", time: { created: STORY_TIME + 2000 } },
          {
            id: "msg_report",
            type: "assistant",
            agent: "build",
            model: STORY_MODEL,
            time: { created: STORY_TIME + 2100 },
            content: [report],
          },
        ]
      : []
  const document = createMemo(
    (): SessionDocument => ({
      sessionID: `ses_chart_${state.session}`,
      status: { type: state.completed && !followUp.length ? "idle" : "busy" },
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
          content: [
            ...(scenario === "reasoning" ? [{ type: "reasoning" as const, text: state.text }] : []),
            { type: "text", text: state.text },
          ],
        },
        ...followUp,
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
          <Show when={followUp.length}>
            <Button onClick={() => setReport("text", (text) => text + "https://example.org/report")}>Append URL</Button>
            <Button onClick={() => setReport("text", (text) => text + "），见下文。")}>Append punctuation</Button>
          </Show>
        </nav>
        <div style={{ width: state.narrow ? "360px" : "100%", display: state.hidden ? "none" : "block" }}>
          <Show when={state.mounted}>
            <SessionUIProvider data={{ session: [], session_status: {}, session_diff: {} }} directory="/workspace">
              <CurrentSessionProviders document={document()}>
                <CompactMessageTimeline document={document()} showReasoningSummaries={scenario === "reasoning"} />
              </CurrentSessionProviders>
            </SessionUIProvider>
          </Show>
        </div>
      </section>
    </AppBaseProviders>
  )
}

render(() => <Fixture />, document.getElementById("oc-agent")!)
