import { createOpencodeClient } from "@opencode-ai/sdk/client"
import type { ServerInfo } from "@/context/server"
import { serverAuthHeader } from "@/utils/server"

export type ServerClientConfig = Omit<NonNullable<Parameters<typeof createOpencodeClient>[0]>, "baseUrl">

export type OpencodeClient = ReturnType<typeof createOpencodeClient>

export function createClientForServer({
  server,
  ...config
}: ServerClientConfig & {
  server: ServerInfo
}): OpencodeClient {
  const auth = serverAuthHeader(server)
  return createOpencodeClient({
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
    client: createClientForServer({ server, throwOnError: true }),
    createClient(config: ServerClientConfig = {}) {
      return createClientForServer({
        server,
        ...config,
      })
    },
  }
}
