import { awaitDesktopInitialization } from "@/context/platform"

export type ServerInfo = {
  url: string
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
      username: data.username ?? undefined,
      password: data.password ?? undefined,
    }))
  }

  if (import.meta.env.DEV) {
    return Promise.resolve({ url: location.origin })
  }

  return Promise.resolve({ url: configuredServerUrl() ?? location.origin })
}
