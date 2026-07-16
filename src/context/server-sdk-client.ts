import { OpenCode } from "@opencode-ai/client"
import type { ServerInfo } from "@/context/server-resolver"
import { serverAuthHeader } from "@/utils/server"

// 7777 creates clients directly instead of providing the main app's reactive server SDK context.

export type ServerClientConfig = Omit<Parameters<typeof OpenCode.make>[0], "baseUrl">

export type OpencodeClient = ReturnType<typeof OpenCode.make>

export function createClientForServer({
  server,
  ...config
}: ServerClientConfig & {
  server: ServerInfo
}): OpencodeClient {
  const auth = serverAuthHeader(server)
  return OpenCode.make({
    ...config,
    headers: {
      ...(config.headers instanceof Headers ? Object.fromEntries(config.headers.entries()) : config.headers),
      ...auth,
    },
    baseUrl: server.url,
  })
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
