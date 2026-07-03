import { For, Show } from "solid-js"
import { permissionDescription, type PermissionRequestView } from "@/context/permission"

export function SessionPermissionDock(props: {
  request: PermissionRequestView
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
}) {
  const description = () => permissionDescription(props.request.permission)

  return (
    <section
      class="mx-auto mb-3 max-w-[1120px] rounded-xl border border-[var(--v2-state-border-warning)] bg-[var(--v2-state-bg-warning)] p-3.5 shadow-[var(--v2-elevation-raised)] max-[720px]:mb-2.5"
      aria-label="Permission required"
    >
      <div class="flex items-start gap-3">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-v2-background-bg-layer-02 text-sm font-extrabold text-[var(--v2-state-fg-warning)]">
          !
        </div>
        <div>
          <h2 class="m-0 text-sm font-[760] leading-[1.3] text-[var(--v2-state-fg-warning)]">Permission required</h2>
          <p class="m-0 mt-1 text-[13px] leading-[1.45] text-v2-text-text-muted">
            {props.request.title || description()}
          </p>
        </div>
      </div>
      <Show when={props.request.title && description()}>
        <p class="mb-0 ml-10 mt-1 text-[13px] leading-[1.45] text-v2-text-text-muted max-[720px]:ml-0">
          {description()}
        </p>
      </Show>
      <Show when={props.request.patterns.length > 0}>
        <div class="ml-10 mt-3 flex flex-col gap-1.5 max-[720px]:ml-0">
          <For each={props.request.patterns}>
            {(pattern) => (
              <code class="[overflow-wrap:anywhere] rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 py-1.5 font-mono text-xs leading-[1.45] text-v2-text-text-base">
                {pattern}
              </code>
            )}
          </For>
        </div>
      </Show>
      <div class="mt-3.5 flex justify-end gap-2 max-[720px]:flex-wrap">
        <button
          type="button"
          class="min-h-8 rounded-lg border border-v2-border-border-base bg-v2-background-bg-button-neutral px-3 text-[13px] font-[680] text-v2-text-text-base hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover disabled:opacity-55"
          disabled={props.responding}
          onClick={() => props.onDecide("reject")}
        >
          Deny
        </button>
        <button
          type="button"
          class="min-h-8 rounded-lg border border-v2-border-border-base bg-v2-background-bg-button-neutral px-3 text-[13px] font-[680] text-v2-text-text-base hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover disabled:opacity-55"
          disabled={props.responding}
          onClick={() => props.onDecide("always")}
        >
          Allow always
        </button>
        <button
          type="button"
          class="min-h-8 rounded-lg border border-v2-border-border-base bg-v2-background-bg-accent px-3 text-[13px] font-[680] text-v2-text-text-contrast hover:enabled:bg-[var(--v2-text-text-accent-hover)] disabled:opacity-55"
          disabled={props.responding}
          onClick={() => props.onDecide("once")}
        >
          Allow once
        </button>
      </div>
    </section>
  )
}
