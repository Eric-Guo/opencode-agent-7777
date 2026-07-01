import { For, Show } from "solid-js"
import { PromptInput } from "@/components/prompt-input"
import type { ModelSelection } from "@/context/local"
import type { ModelLoadStatus, ModelOption, PermissionRequestView } from "@/context/sync"

function permissionDescription(permission: string) {
  if (permission === "external_directory") return "Access files outside the project directory"
  if (permission === "grep") return "Search file contents with a regular expression"
  if (permission === "glob") return "Match files with a glob pattern"
  if (permission === "list") return "List files in a directory"
  if (permission === "read") return "Read files matching the requested path"
  if (permission === "bash") return "Run a shell command"
  return "The agent needs permission to continue"
}

function SessionPermissionDock(props: {
  request: PermissionRequestView
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
}) {
  const description = () => permissionDescription(props.request.permission)

  return (
    <section class="permission-dock" aria-label="Permission required">
      <div class="permission-header">
        <div class="permission-icon">!</div>
        <div>
          <h2>Permission required</h2>
          <p>{props.request.title || description()}</p>
        </div>
      </div>
      <Show when={props.request.title && description()}>
        <p class="permission-hint">{description()}</p>
      </Show>
      <Show when={props.request.patterns.length > 0}>
        <div class="permission-patterns">
          <For each={props.request.patterns}>{(pattern) => <code>{pattern}</code>}</For>
        </div>
      </Show>
      <div class="permission-actions">
        <button
          type="button"
          class="permission-button"
          disabled={props.responding}
          onClick={() => props.onDecide("reject")}
        >
          Deny
        </button>
        <button
          type="button"
          class="permission-button"
          disabled={props.responding}
          onClick={() => props.onDecide("always")}
        >
          Allow always
        </button>
        <button
          type="button"
          class="permission-button permission-primary"
          disabled={props.responding}
          onClick={() => props.onDecide("once")}
        >
          Allow once
        </button>
      </div>
    </section>
  )
}

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
      class="composer"
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
