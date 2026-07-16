import { createEffect } from "solid-js"
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { currentLocalAgent } from "@/context/server-session-store"

function Root() {
  createEffect(() => {
    document.title = currentLocalAgent()
  })
  return (
    <AppBaseProviders>
      <AppInterface />
    </AppBaseProviders>
  )
}

const agentRoot = document.getElementById("oc-agent")
if (agentRoot instanceof HTMLElement) {
  render(() => <Root />, agentRoot)
}
