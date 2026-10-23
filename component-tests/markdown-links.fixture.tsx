import { Markdown } from "@opencode/session-ui/markdown"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { AppBaseProviders } from "../src/app"
import { SessionUIProvider } from "../src/shell/routes/session-ui-provider"

const text = [
  String.raw`📄 **[上海天华撤销生产部门明细.xlsx](C:\workspace\上海天华撤销生产部门明细.xlsx)**`,
  "[Encoded workbook](file:///C:/workspace/%E6%8A%A5%E8%A1%A8%20%231%25.xlsx)",
  "[Relative workbook](./reports/summary.xlsx)",
  "[Absolute workbook](/workspace/summary.xlsx)",
  "[Source reference](./script.ts#L42)",
  "[Website](https://example.com/report.xlsx)",
].join("\n\n")

function Fixture() {
  const [state, setState] = createStore({ directory: "C:\\workspace" })
  return (
    <AppBaseProviders locale="en">
      <button onClick={() => setState("directory", "/another-workspace")}>Switch directory</button>
      <SessionUIProvider data={{ session: [], session_status: {}, session_diff: {} }} directory={state.directory}>
        <Markdown text={text} />
      </SessionUIProvider>
    </AppBaseProviders>
  )
}

render(() => <Fixture />, document.getElementById("oc-agent")!)
