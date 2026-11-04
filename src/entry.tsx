import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { isAgent7777Enabled } from "@/runtime/platform/platform-bridge"

function Root() {
  return (
    <AppBaseProviders>
      <AppInterface />
    </AppBaseProviders>
  )
}

const agentRoot = document.getElementById("oc-agent")
const options = {
  activateInElectronOnly: import.meta.env.VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY !== "false",
}
if (agentRoot instanceof HTMLElement && isAgent7777Enabled(navigator.userAgent, options.activateInElectronOnly)) {
  render(() => <Root />, agentRoot)
}
