import type { SessionDocument } from "@opencode/session-ui/document"
import { CurrentSessionProviders, STORY_MODEL, STORY_TIME } from "@opencode/session-ui/storybook"
import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { AppBaseProviders } from "../src/app"
import { CompactMessageTimeline } from "../src/session/timeline/message-timeline-compact"
import { SessionUIProvider } from "../src/shell/routes/session-ui-provider"

const text = [
  String.raw`📄 **[上海天华撤销生产部门明细.xlsx](C:\workspace\上海天华撤销生产部门明细.xlsx)**`,
  "[Encoded workbook](file:///C:/workspace/%E6%8A%A5%E8%A1%A8%20%231%25.xlsx)",
  "[Relative workbook](./reports/summary.xlsx)",
  "[Absolute workbook](/workspace/summary.xlsx)",
  "[Source reference](./script.ts#L42)",
  "**来源**：`report.contract_signing`（https://cybros.thape.com.cn/report/contract_signing）、`report.subsidiary_receive`（https://cybros.thape.com.cn/report/subsidiary_receive），数据生成时间 2026-11-01（Asia/Shanghai）。",
  "[Website](https://example.com/report.xlsx)",
].join("\n\n")

function Fixture() {
  const [state, setState] = createStore({ directory: "C:\\workspace" })
  const document = createMemo(
    (): SessionDocument => ({
      sessionID: "ses_markdown_links",
      status: { type: "idle" },
      diffs: [],
      messages: [
        {
          id: "msg_markdown_links",
          type: "assistant",
          agent: "build",
          model: STORY_MODEL,
          time: { created: STORY_TIME, completed: STORY_TIME },
          content: [{ type: "text", text }],
        },
      ],
    }),
  )

  return (
    <AppBaseProviders locale="en">
      <button onClick={() => setState("directory", "/another-workspace")}>Switch directory</button>
      <SessionUIProvider data={{ session: [], session_status: {}, session_diff: {} }} directory={state.directory}>
        <CurrentSessionProviders document={document()}>
          <CompactMessageTimeline document={document()} showReasoningSummaries={false} />
        </CurrentSessionProviders>
      </SessionUIProvider>
    </AppBaseProviders>
  )
}

render(() => <Fixture />, document.getElementById("oc-agent")!)
