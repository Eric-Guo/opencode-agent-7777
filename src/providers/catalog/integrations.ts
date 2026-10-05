import type { Data } from "@opencode/client/solid"
import type { IntegrationInfo } from "@opencode/client/promise"
import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"
import type { OpenCodeEventStream } from "@/runtime/server/client-compact"

type IntegrationSource = { data: Data; directory: string }

// The shared resource owns the catalog. The compact adapter only owns whether
// its current read is ready and refreshes it through the existing event stream.
export function createIntegrationCatalog(input: {
  source: Accessor<IntegrationSource | undefined>
  events: OpenCodeEventStream
}) {
  const [loaded, setLoaded] = createSignal<IntegrationSource>()
  createEffect(
    on(input.source, (source) => {
      setLoaded(undefined)
      if (!source) return
      const resource = source.data.location.integration
      const location = { directory: source.directory }
      let active = true
      let revision = 0
      const refresh = () => {
        const version = ++revision
        setLoaded(undefined)
        resource.invalidate(location)
        void resource.sync(location).then(
          () => {
            if (active && version === revision) setLoaded(source)
          },
          () => {}, // Optional connection metadata must not disable model selection.
        )
      }
      const stop = input.events.listen((event) => {
        if (
          event.type !== "server.connected" &&
          event.type !== "credential.updated" &&
          event.type !== "credential.switched" &&
          event.type !== "integration.updated" &&
          event.type !== "integration.connection.switched"
        )
          return
        if (
          event.type === "integration.updated" &&
          event.location?.directory &&
          event.location.directory !== source.directory
        )
          return
        refresh()
      })
      onCleanup(() => {
        active = false
        stop()
      })
      // Opening the selector again also recovers from failed or missed reads.
      refresh()
    }),
  )

  return {
    list: () => {
      const source = input.source()
      return source && loaded() === source
        ? (source.data.location.integration.list({ directory: source.directory }) ?? [])
        : []
    },
  }
}

export function usesChatGPTPlan(providerID: string | undefined, integrations: readonly IntegrationInfo[]) {
  if (providerID !== "openai") return false
  const connection = integrations.find((integration) => integration.id === "openai")?.connections[0]
  return connection?.type === "credential" && connection.method === "oauth"
}
