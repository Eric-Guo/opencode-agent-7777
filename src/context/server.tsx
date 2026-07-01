export type ServerInfo = {
  url: string
  username?: string
  password?: string
}

export function resolveServer(): Promise<ServerInfo> {
  if (window.api?.awaitInitialization) {
    return window.api.awaitInitialization().then((data) => ({
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
    })
  }

  return Promise.resolve({ url: location.origin })
}
