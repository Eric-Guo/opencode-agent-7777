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
      class="mx-auto mb-3 max-w-[1120px] rounded-xl border border-[#4b3b2d] bg-[#1a1512] p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.24)] max-[720px]:mb-2.5"
      aria-label="Permission required"
    >
      <div class="flex items-start gap-3">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#3a281d] text-sm font-extrabold text-[#f0a069]">
          !
        </div>
        <div>
          <h2 class="m-0 text-sm font-[760] leading-[1.3] text-[#f1e7df]">Permission required</h2>
          <p class="m-0 mt-1 text-[13px] leading-[1.45] text-[#bdb2aa]">{props.request.title || description()}</p>
        </div>
      </div>
      <Show when={props.request.title && description()}>
        <p class="mb-0 ml-10 mt-1 text-[13px] leading-[1.45] text-[#bdb2aa] max-[720px]:ml-0">
          {description()}
        </p>
      </Show>
      <Show when={props.request.patterns.length > 0}>
        <div class="ml-10 mt-3 flex flex-col gap-1.5 max-[720px]:ml-0">
          <For each={props.request.patterns}>
            {(pattern) => (
              <code class="[overflow-wrap:anywhere] rounded-md border border-[#45372e] bg-[#111112] px-2 py-1.5 font-mono text-xs leading-[1.45] text-[#f0d7c6]">
                {pattern}
              </code>
            )}
          </For>
        </div>
      </Show>
      <div class="mt-3.5 flex justify-end gap-2 max-[720px]:flex-wrap">
        <button
          type="button"
          class="min-h-8 rounded-lg border border-[#3b3d42] bg-[#202124] px-3 text-[13px] font-[680] text-[#d9dadd] hover:enabled:border-[#555960] hover:enabled:bg-[#292b30] disabled:opacity-55"
          disabled={props.responding}
          onClick={() => props.onDecide("reject")}
        >
          Deny
        </button>
        <button
          type="button"
          class="min-h-8 rounded-lg border border-[#3b3d42] bg-[#202124] px-3 text-[13px] font-[680] text-[#d9dadd] hover:enabled:border-[#555960] hover:enabled:bg-[#292b30] disabled:opacity-55"
          disabled={props.responding}
          onClick={() => props.onDecide("always")}
        >
          Allow always
        </button>
        <button
          type="button"
          class="min-h-8 rounded-lg border border-[#8a5130] bg-[#9d5a34] px-3 text-[13px] font-[680] text-[#fff7f0] hover:enabled:border-[#b56c3f] hover:enabled:bg-[#ad653b] disabled:opacity-55"
          disabled={props.responding}
          onClick={() => props.onDecide("once")}
        >
          Allow once
        </button>
      </div>
    </section>
  )
}
