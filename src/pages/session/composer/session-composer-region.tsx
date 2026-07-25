import { Show } from "solid-js"
import { PromptInputV2Composer } from "@/components/prompt-input-v2"
import { useLanguage } from "@/context/language"
import { currentLocalAgent } from "@/context/server-session-store"
import { SessionPermissionDock } from "@/pages/session/composer/session-permission-dock"
import { SessionQuestionDock } from "@/pages/session/composer/session-question-dock"
import type { SessionComposerRegionController } from "@/pages/session/composer/session-composer-region-controller"

export function SessionComposerRegion(props: { controller: SessionComposerRegionController }) {
  const language = useLanguage()
  const controller = props.controller

  return (
    <div
      data-slot="session-composer"
      class="block bg-linear-to-b from-transparent from-0% to-[var(--oc-7777-page-bg)] to-[26%] px-11 pb-6 max-[720px]:px-3.5 max-[720px]:pb-3.5"
    >
      <Show when={controller.questionRequest()}>
        {(request) => (
          <SessionQuestionDock
            request={request()}
            responding={controller.questionResponding()}
            onReply={controller.replyQuestion}
            onReject={controller.rejectQuestion}
          />
        )}
      </Show>
      <Show when={controller.permissionRequest()}>
        {(request) => (
          <SessionPermissionDock
            request={request()}
            responding={controller.permissionResponding()}
            onDecide={controller.decidePermission}
          />
        )}
      </Show>
      <PromptInputV2Composer
        disabled={controller.disabled()}
        busy={controller.busy()}
        placeholder={language.t("prompt.placeholder", { agent: currentLocalAgent() })}
        model={controller.model}
        modelStatus={controller.modelStatus()}
        onAttachmentError={controller.setAttachmentError}
        onSubmit={controller.submitPrompt}
        onAbort={controller.abortPrompt}
      />
    </div>
  )
}
