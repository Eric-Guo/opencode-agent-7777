import { Show } from "solid-js"
import { PromptInput } from "@/components/prompt-input"
import { SessionPermissionDock } from "@/pages/session/composer/session-permission-dock"
import type { SessionComposerRegionController } from "@/pages/session/composer/session-composer-region-controller"

export function SessionComposerRegion(props: {
  controller: SessionComposerRegionController
}) {
  const controller = props.controller

  return (
    <form
      class="block bg-linear-to-b from-transparent from-0% to-[var(--oc-7777-page-bg)] to-[26%] px-11 pb-6 max-[720px]:px-3.5 max-[720px]:pb-3.5"
      onSubmit={(event) => {
        event.preventDefault()
        controller.submitPrompt()
      }}
    >
      <Show when={controller.permissionRequest()}>
        {(request) => (
          <SessionPermissionDock
            request={request()}
            responding={controller.permissionResponding()}
            onDecide={controller.decidePermission}
          />
        )}
      </Show>
      <PromptInput
        value={controller.prompt()}
        attachments={controller.attachments()}
        disabled={controller.disabled()}
        busy={controller.busy()}
        canSubmit={controller.canSubmit()}
        placeholder="Ask 7777"
        models={controller.models()}
        selectedModel={controller.selectedModel()}
        modelStatus={controller.modelStatus()}
        onChange={controller.setPrompt}
        onAttachmentAdd={controller.addAttachment}
        onAttachmentRemove={controller.removeAttachment}
        onAttachmentError={controller.setAttachmentError}
        onModelSelect={controller.selectModel}
        onSubmit={controller.submitPrompt}
        onAbort={controller.abortPrompt}
      />
    </form>
  )
}
