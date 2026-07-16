import { awaitDesktopInitialization } from "@/context/platform-bridge"

// Resolves the single server used by 7777 rather than exposing the main app's server registry context.

export const DEFAULT_LOCAL_AGENT = "7777"

export type ServerInfo = {
  url: string
  localAgent: string
  username?: string
  password?: string
}

function configuredServerUrl() {
  const port = import.meta.env.VITE_OPENCODE_SERVER_PORT
  if (!port) return

  const host = import.meta.env.VITE_OPENCODE_SERVER_HOST || location.hostname
  return `http://${host}:${port}`
}

export function resolveServer(): Promise<ServerInfo> {
  const desktopInitialization = awaitDesktopInitialization()
  if (desktopInitialization) {
    return desktopInitialization.then((data) => ({
      url: data.url,
      localAgent: data.localAgent ?? DEFAULT_LOCAL_AGENT,
      username: data.username ?? undefined,
      password: data.password ?? undefined,
    }))
  }

  if (import.meta.env.DEV) {
    return Promise.resolve({ url: location.origin, localAgent: DEFAULT_LOCAL_AGENT })
  }

  return Promise.resolve({ url: configuredServerUrl() ?? location.origin, localAgent: DEFAULT_LOCAL_AGENT })
}
