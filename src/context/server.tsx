import { awaitDesktopInitialization } from "@/context/platform"

export type ServerInfo = {
  url: string
  username?: string
  password?: string
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
    return Promise.resolve({
      url: `http://${import.meta.env.VITE_OPENCODE_SERVER_HOST ?? "localhost"}:${
        import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"
      }`,
      username: import.meta.env.OPENCODE_SERVER_USERNAME,
      password: import.meta.env.OPENCODE_SERVER_PASSWORD,
    })
  }

  return Promise.resolve({ url: location.origin })
}
