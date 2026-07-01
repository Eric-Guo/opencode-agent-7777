import { createOpencodeClient } from "@opencode-ai/sdk/client"
import type { ServerInfo } from "@/context/server"

export type OpencodeClient = ReturnType<typeof createOpencodeClient>

function authHeader(server: ServerInfo) {
  if (!server.password) return
  return {
    Authorization: `Basic ${btoa(`${server.username ?? "opencode"}:${server.password}`)}`,
  }
}

export function makeClient(server: ServerInfo, directory?: string) {
  return createOpencodeClient({
    baseUrl: server.url,
    directory,
    headers: authHeader(server),
    throwOnError: true,
  })
}
