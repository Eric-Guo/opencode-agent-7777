import { Show } from "solid-js"
import { PromptInput } from "@/components/prompt-input"
import type { ModelSelection } from "@/context/local"
import type { ModelLoadStatus, ModelOption } from "@/context/models"
import type { PermissionRequestView } from "@/context/permission"
import { SessionPermissionDock } from "@/pages/session/composer/session-permission-dock"

export function SessionComposerRegion(props: {
  prompt: string
  disabled: boolean
  busy: boolean
  canSubmit: boolean
  models: ModelOption[]
  selectedModel: ModelSelection | undefined
  modelStatus: ModelLoadStatus
  permissionRequest: PermissionRequestView | undefined
  permissionResponding: boolean
  onPromptChange: (value: string) => void
  onModelSelect: (model: ModelSelection) => void
  onPermissionDecide: (response: "once" | "always" | "reject") => void
  onSubmit: () => void
  onAbort: () => void
}) {
  return (
    <form
      class="block bg-linear-to-b from-[rgba(17,17,18,0)] from-0% to-[#111112] to-[26%] px-11 pb-6 max-[720px]:px-3.5 max-[720px]:pb-3.5"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit()
      }}
    >
      <Show when={props.permissionRequest}>
        {(request) => (
          <SessionPermissionDock
            request={request()}
            responding={props.permissionResponding}
            onDecide={props.onPermissionDecide}
          />
        )}
      </Show>
      <PromptInput
        value={props.prompt}
        disabled={props.disabled}
        busy={props.busy}
        canSubmit={props.canSubmit}
        placeholder="Ask 7777"
        models={props.models}
        selectedModel={props.selectedModel}
        modelStatus={props.modelStatus}
        onChange={props.onPromptChange}
        onModelSelect={props.onModelSelect}
        onSubmit={props.onSubmit}
        onAbort={props.onAbort}
      />
    </form>
  )
}
