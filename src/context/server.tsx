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
    return Promise.resolve({ url: location.origin })
  }

  return Promise.resolve({ url: location.origin })
}
