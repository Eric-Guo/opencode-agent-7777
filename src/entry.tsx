import { createEffect } from "solid-js"
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { SET_DOCUMENT_TITLE } from "@/constants/session"
import { isAgent7777Enabled } from "@/context/platform-bridge"
import { currentLocalAgent } from "@/context/server-session-store"

function Root() {
  createEffect(() => {
    if (!SET_DOCUMENT_TITLE) return
    document.title = currentLocalAgent()
  })
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
