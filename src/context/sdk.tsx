import type { ServerInfo } from "@/context/server"
import { createServerSdk, type OpencodeClient, type ServerClientConfig } from "@/context/server-sdk"

export type { OpencodeClient } from "@/context/server-sdk"

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
