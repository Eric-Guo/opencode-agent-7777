import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"

const root = document.getElementById("root")
if (root instanceof HTMLElement) {
  render(
    () => (
      <AppBaseProviders>
        <AppInterface />
      </AppBaseProviders>
    ),
    root,
  )
}
