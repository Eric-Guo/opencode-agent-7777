import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"

const agentRoot = document.getElementById("oc-agent")
if (agentRoot instanceof HTMLElement) {
  render(
    () => (
      <AppBaseProviders>
        <AppInterface />
      </AppBaseProviders>
    ),
    agentRoot,
  )
}
