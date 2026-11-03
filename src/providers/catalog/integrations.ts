import type { Data } from "@opencode/client/solid"
import type { IntegrationInfo, OpenCodeEvent } from "@opencode/client/promise"
import { createMemo, createResource, createSignal, onCleanup, type Accessor } from "solid-js"
import type { OpenCodeEventStream } from "@/runtime/server/client-compact"

export type IntegrationSource = { data: Data; directory: string }

function refreshesIntegrations(event: OpenCodeEvent, directory: string) {
  switch (event.type) {
    case "integration.updated":
      return !event.location?.directory || event.location.directory === directory
    case "server.connected":
    case "credential.updated":
    case "credential.switched":
    case "integration.connection.switched":
      return true
    default:
      return false
  }
}

export function createIntegrationCatalog(input: {
  source: Accessor<IntegrationSource | undefined>
  events: OpenCodeEventStream
}) {
  const activeList = createMemo(() => {
    const source = input.source()
    if (!source) return
    const { data, directory } = source
    const catalog = data.location.integration
    const [location, refresh] = createSignal({ directory })
    onCleanup(
      input.events.listen((event) => {
        if (refreshesIntegrations(event, directory)) refresh({ directory })
      }),
    )
    const [read] = createResource(location, (ref) => {
      catalog.invalidate(ref)
      return catalog.sync(ref)
    })
    // Reading only the status keeps the picker usable while a refresh is pending or failed.
    return () => (read.state === "ready" ? catalog.list(location()) : undefined)
  })

  return { list: () => activeList()?.() ?? [] }
}

export function openAIUsesOAuth(integrations: readonly IntegrationInfo[]) {
  const connection = integrations.find((integration) => integration.id === "openai")?.connections[0]
  return connection?.type === "credential" && connection.method === "oauth"
}
