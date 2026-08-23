import type { ServerInfo } from "@/runtime/server/resolver-compact"
import { createApiForServer, type ServerClientConfig } from "@/runtime/server/api"

// 7777 creates clients directly instead of providing the main app's reactive server SDK context.

export type { ServerClientConfig } from "@/runtime/server/api"
export type OpencodeClient = ReturnType<typeof createApiForServer>

export function createClientForServer({
  server,
  ...config
}: ServerClientConfig & {
  server: ServerInfo
}): OpencodeClient {
  return createApiForServer({ server, ...config })
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
