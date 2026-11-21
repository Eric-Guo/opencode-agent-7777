import { OpenCode, type FormInfo, type SessionInfo } from "@opencode/client/promise"
import { Show } from "solid-js"
import { LanguageProvider, UiI18nBridge } from "../src/runtime/i18n/language"
import { setSessionClient, setState } from "../src/runtime/server/session-store-compact"
import { refreshForms } from "../src/session/requests/form-sync-compact"
import { createSessionRequestModel } from "../src/session/requests/model"
import { SessionWebSearchDock } from "../src/session/requests/session-websearch-dock"

export function WebSearchFixture() {
  const session = { id: "parent", location: { directory: "/fixture" } } as SessionInfo
  setSessionClient(OpenCode.make({ baseUrl: new URL("/fixture-api/", location.origin).href }), session)
  const consent: FormInfo = {
    id: "consent",
    sessionID: "child",
    title: "Web search",
    metadata: { kind: "websearch.provider" },
    fields: [{ key: "choice", type: "string" }],
  }
  setState("form", consent.sessionID, [consent])
  setState({ status: "ready", eventsConnected: true })
  const model = createSessionRequestModel()
  return (
    <LanguageProvider locale="en">
      <UiI18nBridge>
        <Show when={model.websearch.request()}>
          <SessionWebSearchDock model={model.websearch} />
        </Show>
        <button onClick={() => void refreshForms()}>Refresh pending forms</button>
        <textarea aria-label="Message" disabled={model.blocked()} />
      </UiI18nBridge>
    </LanguageProvider>
  )
}
