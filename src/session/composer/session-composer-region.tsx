import { Show, type JSX } from "solid-js"
import { SessionPermissionDock } from "@/session/requests/session-permission-dock"
import { SessionQuestionDock } from "@/session/requests/session-question-dock"
import { SessionWebSearchDock } from "@/session/requests/session-websearch-dock"
import type { SessionComposerRegionController } from "@/session/composer/session-composer-region-controller"

export function SessionComposerRegion(props: { controller: SessionComposerRegionController; composer: JSX.Element }) {
  const state = props.controller.state

  return (
    <div
      data-slot="session-composer"
      class="block bg-linear-to-b from-transparent from-0% to-[var(--oc-7777-page-bg)] to-[26%] px-11 pb-6 max-[720px]:px-3.5 max-[720px]:pb-3.5"
    >
      <Show when={state.questionRequest()} keyed>
        {(request) => (
          <SessionQuestionDock
            request={request}
            responding={state.questionResponding()}
            onReply={state.replyQuestion}
            onReject={state.rejectQuestion}
          />
        )}
      </Show>
      <Show when={state.permissionRequest()} keyed>
        {(request) => (
          <SessionPermissionDock
            request={request}
            responding={state.permissionResponding()}
            onDecide={state.decidePermission}
          />
        )}
      </Show>
      <Show when={state.websearch.request()}>
        <SessionWebSearchDock model={state.websearch} />
      </Show>
      {props.composer}
    </div>
  )
}
