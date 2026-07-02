import { For, Show } from "solid-js"
import { permissionDescription, type PermissionRequestView } from "@/context/permission"
import "./session-permission-dock.css"

export function SessionPermissionDock(props: {
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
