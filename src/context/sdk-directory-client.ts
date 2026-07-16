import type { ServerInfo } from "@/context/server-resolver"
import { createServerSdk, type OpencodeClient, type ServerClientConfig } from "@/context/server-sdk-client"

// 7777 scopes a client to one directory without the main app's SDK provider.

export type { OpencodeClient } from "@/context/server-sdk-client"

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
