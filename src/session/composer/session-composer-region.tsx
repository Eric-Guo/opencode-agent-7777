import { Show } from "solid-js"
import { Composer } from "@/composer/composer"
import { createComposerModel } from "@/composer/model"
import { SessionPermissionDock } from "@/session/requests/session-permission-dock"
import { SessionQuestionDock } from "@/session/requests/session-question-dock"
import { createActiveComposerAdapter } from "@/session/composer/adapter"
import type { SessionComposerRegionController } from "@/session/composer/session-composer-region-controller"

export function SessionComposerRegion(props: { controller: SessionComposerRegionController }) {
  const controller = props.controller
  const model = createComposerModel(createActiveComposerAdapter(controller))

  return (
    <div
      data-slot="session-composer"
      class="block bg-linear-to-b from-transparent from-0% to-[var(--oc-7777-page-bg)] to-[26%] px-11 pb-6 max-[720px]:px-3.5 max-[720px]:pb-3.5"
    >
      <Show when={controller.questionRequest()} keyed>
        {(request) => (
          <SessionQuestionDock
            request={request}
            responding={controller.questionResponding()}
            onReply={controller.replyQuestion}
            onReject={controller.rejectQuestion}
          />
        )}
      </Show>
      <Show when={controller.permissionRequest()} keyed>
        {(request) => (
          <SessionPermissionDock
            request={request}
            responding={controller.permissionResponding()}
            onDecide={controller.decidePermission}
          />
        )}
      </Show>
      <Composer model={model} />
    </div>
  )
}
