import type { ServerInfo } from "@/context/server"

export function authTokenFromCredentials(input: { username?: string; password: string }) {
  return btoa(`${input.username ?? "opencode"}:${input.password}`)
}

export function serverAuthHeader(server: ServerInfo): Record<string, string> | undefined {
  if (!server.password) return
  return {
    Authorization: `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`,
  }
}

export function serverHttpHeaders(server: ServerInfo): Record<string, string> {
  return serverAuthHeader(server) ?? {}
}

export function serverUrl(server: ServerInfo, path: string) {
  return `${server.url.replace(/\/$/, "")}${path}`
}
