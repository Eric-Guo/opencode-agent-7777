import { createEffect } from "solid-js"
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { SET_DOCUMENT_TITLE } from "@/constants/session"
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
if (agentRoot instanceof HTMLElement) {
  render(() => <Root />, agentRoot)
}
