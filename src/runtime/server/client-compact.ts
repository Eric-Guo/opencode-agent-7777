import type { OpenCodeEvent } from "@opencode/client/promise"
import type { ServerInfo } from "@/runtime/server/resolver-compact"
import { createApiForServer, type ServerClientConfig } from "@/runtime/server/api"
import { createRequestQueue } from "@/runtime/server/request-queue"

// 7777 creates clients directly instead of providing the main app's reactive server SDK context.

export type { ServerClientConfig } from "@/runtime/server/api"
export type OpencodeClient = ReturnType<typeof createApiForServer>

export type OpenCodeEventStream = {
  listen(handler: (event: OpenCodeEvent) => void): VoidFunction
}

// Directory SDKs and refreshes create short-lived clients. They must share the server's
// transport budget; a queue per client would leave bootstrap requests unbounded.
const transports = new WeakMap<typeof globalThis.fetch, Map<string, ReturnType<typeof createRequestQueue>>>()

function serverFetch(server: ServerInfo, base = globalThis.fetch) {
  let queues = transports.get(base)
  if (!queues) {
    queues = new Map()
    transports.set(base, queues)
  }
  const origin = new URL(server.url).origin
  let queue = queues.get(origin)
  if (!queue) {
    queue = createRequestQueue({ fetch: base })
    queues.set(origin, queue)
  }
  return queue.fetch
}

export function createClientForServer({
  server,
  ...config
}: ServerClientConfig & {
  server: ServerInfo
}): OpencodeClient {
  return createApiForServer({ server, ...config, fetch: serverFetch(server, config.fetch) })
}

export type ServerSdk = {
  server: ServerInfo
  url: string
  client: OpencodeClient
  createClient(config?: ServerClientConfig): OpencodeClient
}

export function createServerSdk(server: ServerInfo): ServerSdk {
  return {
    server,
    url: server.url,
    client: createClientForServer({ server }),
    createClient(config: ServerClientConfig = {}) {
      return createClientForServer({
        server,
        ...config,
      })
    },
  }
}
