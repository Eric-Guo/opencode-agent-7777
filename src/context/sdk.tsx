import { createOpencodeClient } from "@opencode-ai/sdk/client"
import type { ServerInfo } from "@/context/server"
import { serverAuthHeader } from "@/utils/server"

export type OpencodeClient = ReturnType<typeof createOpencodeClient>

export function makeClient(server: ServerInfo, directory?: string) {
  return createOpencodeClient({
    baseUrl: server.url,
    directory,
    headers: serverAuthHeader(server),
    throwOnError: true,
  })
}
