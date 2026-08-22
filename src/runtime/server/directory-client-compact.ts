import type { ServerInfo } from "@/runtime/server/resolver-compact"
import { createServerSdk, type OpencodeClient, type ServerClientConfig } from "@/runtime/server/client-compact"

// 7777 scopes a client to one directory without the main app's SDK provider.

export type { OpencodeClient } from "@/runtime/server/client-compact"

export type DirectorySdk = {
  server: ServerInfo
  directory: string
  url: string
  client: OpencodeClient
  createClient(config?: ServerClientConfig): OpencodeClient
}

export function createDirectorySdk(server: ServerInfo, directory: string): DirectorySdk {
  const serverSdk = createServerSdk(server)
  return {
    server: serverSdk.server,
    directory,
    url: serverSdk.url,
    client: serverSdk.client,
    createClient(config: ServerClientConfig = {}) {
      return serverSdk.createClient(config)
    },
  }
}
