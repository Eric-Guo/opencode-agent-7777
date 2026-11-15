import { createEffect, For, onCleanup, onMount } from "solid-js"
import type { Contribution, ModuleHost, Slot } from "./modules"

export function SlotView(props: { host: ModuleHost; slot: Slot; id?: string; values?: Record<string, unknown> }) {
  return (
    <For each={props.host.entries(props.slot).filter((row) => !props.id || row.id === props.id)}>
      {(entry) => {
        let container!: HTMLDivElement
        let mounted: Contribution | undefined

        const fail = (error: unknown) => {
          container.textContent = error instanceof Error ? error.message : String(error)
        }

        onMount(() => {
          try {
            mounted = entry.component(props.values ?? {})
            container.append(mounted.element)
          } catch (error) {
            fail(error)
          }
        })
        createEffect(() => {
          try {
            mounted?.update?.(props.values ?? {})
          } catch (error) {
            fail(error)
          }
        })
        onCleanup(() => mounted?.dispose?.())

        return <div ref={container} data-module={entry.owner} />
      }}
    </For>
  )
}
