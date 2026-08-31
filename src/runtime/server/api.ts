import { OpenCode, type OpenCodeClient } from "@opencode-ai/client/promise"
import { decode64 } from "@/runtime/persistence/base64"
import type { ServerInfo } from "@/runtime/server/resolver-compact"

export type ServerClientConfig = Omit<Parameters<typeof OpenCode.make>[0], "baseUrl">

export function authTokenFromCredentials(input: { password: string }) {
  return btoa(`opencode:${input.password}`)
}

export function authFromToken(token: string | null) {
  const decoded = decode64(token ?? undefined)
  if (!decoded) return
  const separator = decoded.indexOf(":")
  if (separator === -1) return
  return {
    password: decoded.slice(separator + 1),
  }
}

export function createApiForServer({
  server,
  ...config
}: ServerClientConfig & {
  server: ServerInfo
}): OpenCodeClient {
  return OpenCode.make({
    ...config,
    baseUrl: server.url,
    headers: {
      ...(config.headers instanceof Headers ? Object.fromEntries(config.headers.entries()) : config.headers),
      ...(server.password
        ? {
            Authorization: `Basic ${authTokenFromCredentials({
              password: server.password,
            })}`,
          }
        : {}),
    },
  })
}

export type ServerApi = OpenCodeClient
